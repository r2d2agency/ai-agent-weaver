import { Router } from 'express';
import { query } from '../services/database.js';
import { generateResponse, transcribeAudio, analyzeImage } from '../services/openai.js';
import { sendMessage, downloadMediaForAgent, getAgentEvolutionCredentials } from '../services/evolution.js';

export const webhookRouter = Router();

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

// Clean old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedMessages.entries()) {
    if (now - ts > DEDUP_TTL_MS) {
      processedMessages.delete(id);
    }
  }
}, 30000);

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

    // Find agent by instance name (both online and ghost mode agents)
    const agentResult = await query(
      `SELECT * FROM agents WHERE instance_name = $1 AND status = 'online'`,
      [instanceName]
    );

    if (agentResult.rows.length === 0) {
      console.log(`No active agent found for instance: ${instanceName}`);
      return res.status(200).json({ status: 'ignored', reason: 'no agent' });
    }

    const agent = agentResult.rows[0];
    
    // Check processing options
    const audioEnabled = agent.audio_enabled !== false;
    const imageEnabled = agent.image_enabled !== false;
    const documentEnabled = agent.document_enabled !== false;
    const ghostMode = agent.ghost_mode === true;
    const takeoverTimeout = agent.takeover_timeout || 60;
    const operatingHoursEnabled = agent.operating_hours_enabled === true;

    // Helper function to check if current time is within operating hours
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

    let messageContent: string | null = null;
    let isAudioMessage = false;
    let isImageMessage = false;
    let isDocumentMessage = false;
    let imageBase64: string | undefined;

    // Check for image message
    if (payload.data?.message?.imageMessage && imageEnabled) {
      isImageMessage = true;
      const imageMessage = payload.data.message.imageMessage;
      const caption = imageMessage.caption || '';
      
      console.log(`Received image message from ${phoneNumber}, attempting to analyze...`);
      
      try {
        const base64 = await downloadMediaForAgent(instanceName, payload.data.key.id, agent);
        
        if (base64) {
          imageBase64 = base64;
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
            // For PDFs and other documents, try to analyze as image (first page)
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
      // Save owner's message
      await query(
        `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_audio, is_from_owner) 
         VALUES ($1, 'owner', $2, $3, 'sent', $4, true)`,
        [agent.id, messageContent, phoneNumber, isAudioMessage]
      );

      // Update or insert takeover timestamp
      await query(
        `INSERT INTO conversation_takeover (agent_id, phone_number, taken_over_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (agent_id, phone_number) 
         DO UPDATE SET taken_over_at = CURRENT_TIMESTAMP`,
        [agent.id, phoneNumber]
      );

      // Update agent messages count
      await query(
        `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [agent.id]
      );

      console.log(`Owner message stored, takeover activated for ${phoneNumber}`);
      return res.status(200).json({ status: 'ok', reason: 'owner_message_stored', takeover: true });
    }

    // Save user message
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_audio, is_from_owner) 
       VALUES ($1, 'user', $2, $3, 'received', $4, false)`,
      [agent.id, messageContent, phoneNumber, isAudioMessage]
    );

    // Update conversation activity for inactivity tracking
    await query(
      `INSERT INTO conversation_activity (agent_id, phone_number, last_user_message_at, inactivity_message_sent)
       VALUES ($1, $2, CURRENT_TIMESTAMP, false)
       ON CONFLICT (agent_id, phone_number) 
       DO UPDATE SET last_user_message_at = CURRENT_TIMESTAMP, inactivity_message_sent = false`,
      [agent.id, phoneNumber]
    );

    // Ghost mode: just store messages, don't respond
    if (ghostMode) {
      await query(
        `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [agent.id]
      );
      console.log(`Ghost mode: message stored for ${phoneNumber}, no response sent`);
      return res.status(200).json({ status: 'ok', reason: 'ghost_mode', messageStored: true });
    }

    // Check if outside operating hours
    if (operatingHoursEnabled && !isWithinOperatingHours()) {
      const outOfHoursMessage = agent.out_of_hours_message || 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐';
      
      // Send out of hours message
      await sendMessage(instanceName, phoneNumber, outOfHoursMessage, agent);
      
      // Save the message
      await query(
        `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
         VALUES ($1, 'agent', $2, $3, 'sent', false)`,
        [agent.id, outOfHoursMessage, phoneNumber]
      );
      
      await query(
        `UPDATE agents SET messages_count = messages_count + 2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [agent.id]
      );
      
      console.log(`Out of hours: sent automated message to ${phoneNumber}`);
      return res.status(200).json({ status: 'ok', reason: 'out_of_hours', messageSent: true });
    }

    // Check if conversation is under takeover
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
        // Still in takeover period, don't respond
        await query(
          `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [agent.id]
        );
        console.log(`Takeover active: ${Math.round(takeoverTimeout - secondsSinceTakeover)}s remaining for ${phoneNumber}`);
        return res.status(200).json({ 
          status: 'ok', 
          reason: 'takeover_active', 
          remainingSeconds: Math.round(takeoverTimeout - secondsSinceTakeover) 
        });
      } else {
        // Takeover expired, remove it
        await query(
          `DELETE FROM conversation_takeover WHERE agent_id = $1 AND phone_number = $2`,
          [agent.id, phoneNumber]
        );
        console.log(`Takeover expired for ${phoneNumber}, agent resuming`);
      }
    }

    // Generate AI response
    const aiResponse = await generateResponse(agent, messageContent, phoneNumber);

    // Save agent response
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
       VALUES ($1, 'agent', $2, $3, 'sent', false)`,
      [agent.id, aiResponse, phoneNumber]
    );

    // Update conversation activity with agent response time
    await query(
      `UPDATE conversation_activity 
       SET last_agent_message_at = CURRENT_TIMESTAMP
       WHERE agent_id = $1 AND phone_number = $2`,
      [agent.id, phoneNumber]
    );

    // Update agent messages count
    await query(
      `UPDATE agents SET messages_count = messages_count + 2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agent.id]
    );

    // Send response via Evolution API
    await sendMessage(instanceName, phoneNumber, aiResponse, agent);

    res.status(200).json({ status: 'ok', messageId: payload.data.key.id, isAudio: isAudioMessage });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
