import { Router } from 'express';
import { query } from '../services/database.js';
import { generateResponse, transcribeAudio } from '../services/openai.js';
import { sendMessage, getEvolutionCredentials } from '../services/evolution.js';
import axios from 'axios';

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
    };
    messageTimestamp: number;
  };
}

async function downloadAudio(instanceName: string, messageId: string): Promise<Buffer | null> {
  try {
    const { apiUrl, apiKey } = await getEvolutionCredentials();
    
    // Try to get media from Evolution API
    const response = await axios.get(
      `${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        headers: { 'apikey': apiKey },
        params: { messageId },
        timeout: 30000,
      }
    );

    if (response.data?.base64) {
      return Buffer.from(response.data.base64, 'base64');
    }
    
    return null;
  } catch (error) {
    console.error('Error downloading audio:', error);
    return null;
  }
}

webhookRouter.post('/:instanceName', async (req, res) => {
  try {
    const { instanceName } = req.params;
    const payload: WebhookPayload = req.body;

    // Ignore messages from the bot itself
    if (payload.data?.key?.fromMe) {
      return res.status(200).json({ status: 'ignored', reason: 'fromMe' });
    }

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
    
    // Check if audio processing is enabled for this agent
    const audioEnabled = agent.audio_enabled !== false; // Default to true

    let messageContent: string | null = null;
    let isAudioMessage = false;

    // Check for audio message
    if (payload.data?.message?.audioMessage && audioEnabled) {
      isAudioMessage = true;
      const audioMessage = payload.data.message.audioMessage;
      
      console.log(`Received audio message from ${phoneNumber}, attempting to transcribe...`);
      
      try {
        // Download the audio
        const audioBuffer = await downloadAudio(instanceName, payload.data.key.id);
        
        if (audioBuffer) {
          // Transcribe using Whisper
          messageContent = await transcribeAudio(audioBuffer, audioMessage.mimetype || 'audio/ogg');
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

    // Save user message
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_audio) 
       VALUES ($1, 'user', $2, $3, 'received', $4)`,
      [agent.id, messageContent, phoneNumber, isAudioMessage]
    );

    // Generate AI response
    const aiResponse = await generateResponse(agent, messageContent, phoneNumber);

    // Save agent response
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status) 
       VALUES ($1, 'agent', $2, $3, 'sent')`,
      [agent.id, aiResponse, phoneNumber]
    );

    // Update agent messages count
    await query(
      `UPDATE agents SET messages_count = messages_count + 2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agent.id]
    );

    // Send response via Evolution API
    await sendMessage(instanceName, phoneNumber, aiResponse);

    res.status(200).json({ status: 'ok', messageId: payload.data.key.id, isAudio: isAudioMessage });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
