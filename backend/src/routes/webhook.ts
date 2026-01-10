import { Router } from 'express';
import { query } from '../services/database.js';
import { generateResponse, transcribeAudio, analyzeImage, textToSpeech } from '../services/openai.js';
import { sendMessage, sendMessagesWithDelay, sendMedia, sendAudio, downloadMediaForAgent } from '../services/evolution.js';
import { createLog } from './logs.js';

export const webhookRouter = Router();

interface MediaItem {
  id: string;
  name: string;
  description: string;
  type: 'image' | 'gallery' | 'video';
  file_urls: string[];
  mime_types: string[];
}

interface WebhookPayload {
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
      audioMessage?: {
        url?: string;
        mimetype?: string;
        mediaKey?: string;
        fileEncSha256?: string;
        fileSha256?: string;
        fileLength?: number;
        seconds?: number;
        ptt?: boolean;
      };
      imageMessage?: {
        url?: string;
        mimetype?: string;
        caption?: string;
        mediaKey?: string;
      };
      documentMessage?: {
        url?: string;
        mimetype?: string;
        title?: string;
        fileName?: string;
        mediaKey?: string;
      };
    };
    messageTimestamp: number;
  };
}

// In-memory deduplication cache (messageId -> timestamp)
const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 60000; // 60 seconds

// Pending response timers: key = `${agentId}:${phoneNumber}`
const pendingResponses = new Map<string, NodeJS.Timeout>();
const RESPONSE_DELAY_MS = 8000; // 8 seconds delay before responding

// Clean old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedMessages.entries()) {
    if (now - ts > DEDUP_TTL_MS) {
      processedMessages.delete(id);
    }
  }
}, 30000);

// Helper to process and send AI response
async function processAndRespond(
  agentId: string,
  phoneNumber: string,
  instanceName: string,
  respondWithAudio: boolean = false
) {
  let agent: any = null;
  try {
    // Get agent fresh from DB
    const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
    if (agentResult.rows.length === 0) return;
    agent = agentResult.rows[0];

    const ghostMode = agent.ghost_mode === true;
    const takeoverTimeout = agent.takeover_timeout || 60;
    const operatingHoursEnabled = agent.operating_hours_enabled === true;

    // Check operating hours
    const isWithinOperatingHours = (): boolean => {
      if (!operatingHoursEnabled) return true;
      
      const timezone = agent.operating_hours_timezone || 'America/Sao_Paulo';
      const now = new Date();
      
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
      const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      
      const [startHour, startMinute] = (agent.operating_hours_start || '09:00').split(':').map(Number);
      const [endHour, endMinute] = (agent.operating_hours_end || '18:00').split(':').map(Number);
      const startTimeMinutes = startHour * 60 + startMinute;
      const endTimeMinutes = endHour * 60 + endMinute;
      
      return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
    };

    // Ghost mode: don't respond
    if (ghostMode) {
      console.log(`Ghost mode: skipping response for ${phoneNumber}`);
      return;
    }

    // Check operating hours
    if (operatingHoursEnabled && !isWithinOperatingHours()) {
      const outOfHoursMessage = agent.out_of_hours_message || 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐';
      
      await sendMessage(instanceName, phoneNumber, outOfHoursMessage, agent);
      
      await query(
        `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
         VALUES ($1, 'agent', $2, $3, 'sent', false)`,
        [agent.id, outOfHoursMessage, phoneNumber]
      );
      
      await query(
        `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [agent.id]
      );
      
      console.log(`Out of hours: sent automated message to ${phoneNumber}`);
      return;
    }

    // Check takeover
    const takeoverResult = await query(
      `SELECT taken_over_at FROM conversation_takeover 
       WHERE agent_id = $1 AND phone_number = $2`,
      [agent.id, phoneNumber]
    );

    if (takeoverResult.rows.length > 0) {
      const takenOverAt = new Date(takeoverResult.rows[0].taken_over_at);
      const now = new Date();
      const secondsSinceTakeover = (now.getTime() - takenOverAt.getTime()) / 1000;

      if (secondsSinceTakeover < takeoverTimeout) {
        console.log(`Takeover active: ${Math.round(takeoverTimeout - secondsSinceTakeover)}s remaining for ${phoneNumber}`);
        return;
      } else {
        await query(
          `DELETE FROM conversation_takeover WHERE agent_id = $1 AND phone_number = $2`,
          [agent.id, phoneNumber]
        );
        console.log(`Takeover expired for ${phoneNumber}, agent resuming`);
      }
    }

    // Check if we already responded to recent messages (avoid double response)
    const recentAgentResponse = await query(
      `SELECT id FROM messages 
       WHERE agent_id = $1 AND phone_number = $2 AND sender = 'agent'
       AND created_at > NOW() - INTERVAL '10 seconds'
       LIMIT 1`,
      [agent.id, phoneNumber]
    );

    if (recentAgentResponse.rows.length > 0) {
      console.log(`Already responded recently to ${phoneNumber}, skipping`);
      return;
    }

    // Get all unresponded user messages (messages since last agent response)
    const lastAgentMessage = await query(
      `SELECT created_at FROM messages 
       WHERE agent_id = $1 AND phone_number = $2 AND sender IN ('agent', 'owner')
       ORDER BY created_at DESC LIMIT 1`,
      [agent.id, phoneNumber]
    );

    const sinceDate = lastAgentMessage.rows.length > 0 
      ? lastAgentMessage.rows[0].created_at 
      : new Date(0);

    const pendingMessages = await query(
      `SELECT content, is_audio, created_at FROM messages 
       WHERE agent_id = $1 AND phone_number = $2 AND sender = 'user'
       AND created_at > $3
       ORDER BY created_at ASC`,
      [agent.id, phoneNumber, sinceDate]
    );

    if (pendingMessages.rows.length === 0) {
      console.log(`No pending messages to respond for ${phoneNumber}`);
      return;
    }

    // Combine all pending messages into one context
    const combinedMessage = pendingMessages.rows
      .map((m: any) => m.content)
      .join('\n');

    console.log(`Responding to ${pendingMessages.rows.length} batched messages for ${phoneNumber}`);

    // Generate AI response for all accumulated messages
    const aiResult = await generateResponse(agent, combinedMessage, phoneNumber);
    const { text: aiResponse, mediaToSend } = aiResult;

    // Split response into smaller messages for natural conversation
    const splitMessages = (text: string): string[] => {
      // First, split by explicit separator
      const parts = text.split(/\n*---\n*/);
      const messages: string[] = [];
      
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        
        // If message is still long, split by paragraphs
        if (trimmed.length > 300) {
          const paragraphs = trimmed.split(/\n\n+/);
          for (const p of paragraphs) {
            if (p.trim()) messages.push(p.trim());
          }
        } else {
          messages.push(trimmed);
        }
      }
      
      return messages.length > 0 ? messages : [text];
    };

    const messageParts = splitMessages(aiResponse);
    const fullResponse = messageParts.join('\n\n');

    // Save agent response (full text for history)
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
       VALUES ($1, 'agent', $2, $3, 'sent', false)`,
      [agent.id, fullResponse, phoneNumber]
    );

    // Update conversation activity
    await query(
      `UPDATE conversation_activity 
       SET last_agent_message_at = CURRENT_TIMESTAMP
       WHERE agent_id = $1 AND phone_number = $2`,
      [agent.id, phoneNumber]
    );

    // Update agent messages count
    await query(
      `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agent.id]
    );

    // Check if we should respond with audio
    const shouldRespondWithAudio = respondWithAudio && agent.audio_response_enabled === true;
    
    if (shouldRespondWithAudio) {
      // Generate TTS audio for the response
      try {
        console.log(`Generating audio response for ${phoneNumber}`);
        
        await createLog(
          agent.id,
          'info',
          'Gerando resposta em áudio',
          { voice: agent.audio_response_voice || 'nova', textLength: fullResponse.length },
          phoneNumber,
          'whatsapp'
        );
        
        const audioBuffer = await textToSpeech(agent, fullResponse);
        const audioBase64 = audioBuffer.toString('base64');
        
        // Send audio via Evolution API
        await sendAudio(instanceName, phoneNumber, audioBase64, agent);
        
        console.log(`Audio response sent to ${phoneNumber}`);
        
        await createLog(
          agent.id,
          'info',
          'Resposta em áudio enviada com sucesso',
          { audioSize: audioBuffer.length },
          phoneNumber,
          'whatsapp'
        );
      } catch (audioError: any) {
        console.error('Failed to send audio response, falling back to text:', audioError);
        
        await createLog(
          agent.id,
          'error',
          'Falha ao enviar áudio, enviando texto',
          { error: audioError.message },
          phoneNumber,
          'whatsapp'
        );
        
        // Fallback to text messages
        await sendMessagesWithDelay(instanceName, phoneNumber, messageParts, agent, 1500);
      }
    } else {
      // Send text messages with delay for natural feel
      await sendMessagesWithDelay(instanceName, phoneNumber, messageParts, agent, 1500);
    }

    // Send media items if any
    if (mediaToSend && mediaToSend.length > 0) {
      console.log(`Sending ${mediaToSend.length} media items to ${phoneNumber}`);
      
      await createLog(
        agent.id,
        'info',
        `Iniciando envio de ${mediaToSend.length} mídia(s)`,
        { mediaNames: mediaToSend.map(m => m.name) },
        phoneNumber,
        'whatsapp'
      );

      let mediaSentCount = 0;
      let mediaErrorCount = 0;

      for (const media of mediaToSend) {
        try {
          console.log(`Processing media: ${media.name}, type: ${media.type}, urls count: ${media.file_urls?.length || 0}`);
          
          await createLog(
            agent.id,
            'info',
            `Processando mídia: ${media.name}`,
            { 
              type: media.type, 
              urlsCount: media.file_urls?.length || 0,
              mimeTypes: media.mime_types 
            },
            phoneNumber,
            'whatsapp'
          );

          // Small delay between media
          await new Promise(resolve => setTimeout(resolve, 800));

          if (!media.file_urls || media.file_urls.length === 0) {
            console.error(`No file URLs for media: ${media.name}`);
            await createLog(agent.id, 'error', `Sem URLs para mídia: ${media.name}`, {}, phoneNumber, 'whatsapp');
            mediaErrorCount++;
            continue;
          }

          for (let i = 0; i < media.file_urls.length; i++) {
            const fileUrl = media.file_urls[i];
            const mimeType = media.mime_types?.[i] || 'image/jpeg';

            console.log(`Sending file ${i + 1}/${media.file_urls.length}, mimeType: ${mimeType}, url type: ${typeof fileUrl}, url length: ${fileUrl?.length || 0}`);

            if (!fileUrl) {
              console.error(`Empty file URL at index ${i}`);
              await createLog(agent.id, 'error', `URL vazia no índice ${i}`, {}, phoneNumber, 'whatsapp');
              mediaErrorCount++;
              continue;
            }

            // Extract base64 from data URL
            const base64Match = fileUrl.match(/^data:[^;]+;base64,(.+)$/);
            
            if (base64Match) {
              const base64 = base64Match[1];
              const caption = i === 0 ? media.name : undefined;

              console.log(`Sending base64 media, base64 length: ${base64.length}, caption: ${caption}`);
              
              await createLog(
                agent.id,
                'info',
                `Enviando via Evolution API`,
                { 
                  base64Length: base64.length, 
                  mimeType, 
                  caption,
                  urlPrefix: fileUrl.substring(0, 50)
                },
                phoneNumber,
                'whatsapp'
              );
              
              try {
                await sendMedia(instanceName, phoneNumber, base64, mimeType, caption, agent);
                mediaSentCount++;
                console.log(`Media sent successfully: ${media.name}`);
                
                await createLog(
                  agent.id,
                  'media_send',
                  `Mídia enviada com sucesso: ${media.name}`,
                  { mimeType, caption },
                  phoneNumber,
                  'whatsapp'
                );
              } catch (sendErr: any) {
                console.error(`Evolution API error:`, sendErr.response?.data || sendErr.message);
                await createLog(
                  agent.id,
                  'error',
                  `Erro Evolution API ao enviar ${media.name}`,
                  { error: sendErr.response?.data || sendErr.message },
                  phoneNumber,
                  'whatsapp'
                );
                mediaErrorCount++;
              }

              // Small delay between gallery items
              if (i < media.file_urls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } else {
              console.error(`File URL is not a valid data URL. Type: ${typeof fileUrl}, Preview: ${String(fileUrl).substring(0, 100)}...`);
              await createLog(
                agent.id,
                'error',
                `URL inválida (não é data URL)`,
                { urlPreview: String(fileUrl).substring(0, 100), urlType: typeof fileUrl },
                phoneNumber,
                'whatsapp'
              );
              mediaErrorCount++;
            }
          }
        } catch (mediaError: any) {
          mediaErrorCount++;
          console.error(`Error sending media ${media.name}:`, mediaError);
          await createLog(
            agent.id,
            'error',
            `Erro geral ao enviar ${media.name}`,
            { error: String(mediaError) },
            phoneNumber,
            'whatsapp'
          );
        }
      }

      // Log summary
      await createLog(
        agent.id,
        mediaSentCount > 0 ? 'info' : 'error',
        `Resumo envio: ${mediaSentCount} sucesso, ${mediaErrorCount} erros`,
        { sent: mediaSentCount, errors: mediaErrorCount },
        phoneNumber,
        'whatsapp'
      );

      // If the AI promised media but we couldn't send anything, notify the user.
      if (mediaErrorCount > 0 && mediaSentCount === 0) {
        try {
          await sendMessage(
            instanceName,
            phoneNumber,
            'Tive um problema ao enviar a imagem/vídeo agora. Pode tentar novamente ou me dizer qual produto você quer ver?',
            agent
          );
        } catch (notifyErr) {
          console.error('Failed to notify user about media failure:', notifyErr);
        }
      }
    }

    console.log(`Batched response sent to ${phoneNumber} (${messageParts.length} messages, ${mediaToSend?.length || 0} media)`);
  } catch (error) {
    console.error(`Error processing batched response for ${phoneNumber}:`, error);
    // Fallback: never stay silent
    try {
      await sendMessage(instanceName, phoneNumber, 'Desculpe, tive um problema aqui e não consegui responder agora. Pode repetir a pergunta?', agent);
    } catch (sendErr) {
      console.error('Failed to send fallback message:', sendErr);
    }
  }
}

webhookRouter.post('/:instanceName', async (req, res) => {
  try {
    const { instanceName } = req.params;
    const payload: WebhookPayload = req.body;

    const messageId = payload.data?.key?.id;

    // Deduplicate: skip if we already processed this messageId recently
    if (messageId && processedMessages.has(messageId)) {
      console.log(`Duplicate webhook ignored for messageId: ${messageId}`);
      return res.status(200).json({ status: 'ignored', reason: 'duplicate' });
    }

    // Mark as processed
    if (messageId) {
      processedMessages.set(messageId, Date.now());
    }

    const isFromMe = payload.data?.key?.fromMe === true;

    // Extract phone number (remove @s.whatsapp.net)
    const phoneNumber = payload.data.key.remoteJid.replace('@s.whatsapp.net', '');

    // Find agent by instance name
    const agentResult = await query(
      `SELECT * FROM agents WHERE instance_name = $1 AND status = 'online'`,
      [instanceName]
    );

    if (agentResult.rows.length === 0) {
      console.log(`No active agent found for instance: ${instanceName}`);
      return res.status(200).json({ status: 'ignored', reason: 'no agent' });
    }

    const agent = agentResult.rows[0];
    
    const audioEnabled = agent.audio_enabled !== false;
    const imageEnabled = agent.image_enabled !== false;
    const documentEnabled = agent.document_enabled !== false;

    let messageContent: string | null = null;
    let isAudioMessage = false;
    let isImageMessage = false;
    let isDocumentMessage = false;

    // Check for image message
    if (payload.data?.message?.imageMessage && imageEnabled) {
      isImageMessage = true;
      const imageMessage = payload.data.message.imageMessage;
      const caption = imageMessage.caption || '';
      
      console.log(`Received image message from ${phoneNumber}, attempting to analyze...`);
      
      try {
        const base64 = await downloadMediaForAgent(instanceName, payload.data.key.id, agent);
        
        if (base64) {
          const imageAnalysis = await analyzeImage(agent, base64, caption || 'Descreva esta imagem detalhadamente.');
          messageContent = caption ? `[Imagem com legenda: "${caption}"]\n\nAnálise da imagem: ${imageAnalysis}` : `[Imagem recebida]\n\nAnálise: ${imageAnalysis}`;
          console.log(`Image analyzed successfully`);
        } else {
          messageContent = caption || '[Imagem recebida - não foi possível processar]';
        }
      } catch (err) {
        console.error('Image analysis error:', err);
        messageContent = caption || '[Imagem recebida - erro no processamento]';
      }
    }
    // Check for document message
    else if (payload.data?.message?.documentMessage && documentEnabled) {
      isDocumentMessage = true;
      const docMessage = payload.data.message.documentMessage;
      const fileName = docMessage.fileName || docMessage.title || 'documento';
      const mimeType = docMessage.mimetype || '';
      
      console.log(`Received document from ${phoneNumber}: ${fileName} (${mimeType})`);
      
      try {
        const base64 = await downloadMediaForAgent(instanceName, payload.data.key.id, agent);
        
        if (base64 && (mimeType.includes('image') || mimeType.includes('pdf'))) {
          if (mimeType.includes('image')) {
            const imageAnalysis = await analyzeImage(agent, base64, `Analise este documento/imagem: ${fileName}`);
            messageContent = `[Documento: ${fileName}]\n\nConteúdo: ${imageAnalysis}`;
          } else {
            messageContent = `[Documento PDF recebido: ${fileName}]\n\nNota: Recebi seu documento. Como posso ajudá-lo com ele?`;
          }
        } else {
          messageContent = `[Documento recebido: ${fileName}]`;
        }
      } catch (err) {
        console.error('Document processing error:', err);
        messageContent = `[Documento recebido: ${fileName} - erro no processamento]`;
      }
    }
    // Check for audio message
    else if (payload.data?.message?.audioMessage && audioEnabled) {
      isAudioMessage = true;
      const audioMessage = payload.data.message.audioMessage;

      console.log(`Received audio message from ${phoneNumber}, attempting to transcribe...`);

      try {
        const base64 = await downloadMediaForAgent(instanceName, payload.data.key.id, agent);

        if (base64) {
          const audioBuffer = Buffer.from(base64, 'base64');

          const rawMime = audioMessage.mimetype || 'audio/ogg';
          const cleanMime = rawMime.split(';')[0].trim() || 'audio/ogg';
          const fileName = cleanMime.includes('mp3') || cleanMime.includes('mpeg')
            ? 'audio.mp3'
            : cleanMime.includes('mp4') || cleanMime.includes('m4a')
              ? 'audio.m4a'
              : cleanMime.includes('wav')
                ? 'audio.wav'
                : cleanMime.includes('webm')
                  ? 'audio.webm'
                  : 'audio.ogg';

          messageContent = await transcribeAudio(agent, audioBuffer, cleanMime, fileName);
          console.log(`Transcribed audio: "${messageContent}"`);
        } else {
          console.log('Could not download audio');
          messageContent = '[Áudio recebido - não foi possível transcrever]';
        }
      } catch (transcribeError) {
        console.error('Audio transcription error:', transcribeError);
        messageContent = '[Áudio recebido - erro na transcrição]';
      }
    } else {
      // Extract text message content
      messageContent = 
        payload.data?.message?.conversation || 
        payload.data?.message?.extendedTextMessage?.text || null;
    }

    if (!messageContent) {
      return res.status(200).json({ status: 'ignored', reason: 'no content' });
    }

    // If message is from owner (fromMe), store it and set takeover
    if (isFromMe) {
      await query(
        `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_audio, is_from_owner) 
         VALUES ($1, 'owner', $2, $3, 'sent', $4, true)`,
        [agent.id, messageContent, phoneNumber, isAudioMessage]
      );

      await query(
        `INSERT INTO conversation_takeover (agent_id, phone_number, taken_over_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (agent_id, phone_number) 
         DO UPDATE SET taken_over_at = CURRENT_TIMESTAMP`,
        [agent.id, phoneNumber]
      );

      await query(
        `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [agent.id]
      );

      // Cancel any pending AI response for this conversation
      const pendingKey = `${agent.id}:${phoneNumber}`;
      if (pendingResponses.has(pendingKey)) {
        clearTimeout(pendingResponses.get(pendingKey)!);
        pendingResponses.delete(pendingKey);
        console.log(`Cancelled pending AI response due to owner message`);
      }

      console.log(`Owner message stored, takeover activated for ${phoneNumber}`);
      return res.status(200).json({ status: 'ok', reason: 'owner_message_stored', takeover: true });
    }

    // Save user message immediately
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_audio, is_from_owner) 
       VALUES ($1, 'user', $2, $3, 'received', $4, false)`,
      [agent.id, messageContent, phoneNumber, isAudioMessage]
    );

    // Update conversation activity
    await query(
      `INSERT INTO conversation_activity (agent_id, phone_number, last_user_message_at, inactivity_message_sent)
       VALUES ($1, $2, CURRENT_TIMESTAMP, false)
       ON CONFLICT (agent_id, phone_number) 
       DO UPDATE SET last_user_message_at = CURRENT_TIMESTAMP, inactivity_message_sent = false`,
      [agent.id, phoneNumber]
    );

    // Update messages count
    await query(
      `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agent.id]
    );

    // Schedule delayed response (reset timer if already pending)
    const pendingKey = `${agent.id}:${phoneNumber}`;
    
    // Store whether the last message was audio for audio response logic
    const shouldRespondWithAudio = isAudioMessage;
    
    if (pendingResponses.has(pendingKey)) {
      clearTimeout(pendingResponses.get(pendingKey)!);
      console.log(`Reset response timer for ${phoneNumber}`);
    }

    const timeout = setTimeout(() => {
      pendingResponses.delete(pendingKey);
      processAndRespond(agent.id, phoneNumber, instanceName, shouldRespondWithAudio);
    }, RESPONSE_DELAY_MS);

    pendingResponses.set(pendingKey, timeout);

    console.log(`Message saved, response scheduled in ${RESPONSE_DELAY_MS / 1000}s for ${phoneNumber} (audioResponse: ${shouldRespondWithAudio})`);
    res.status(200).json({ status: 'ok', messageId: payload.data.key.id, scheduled: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
