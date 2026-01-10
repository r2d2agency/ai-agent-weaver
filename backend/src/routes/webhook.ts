import { Router } from 'express';
import { query } from '../services/database.js';
import { generateResponse } from '../services/openai.js';
import { sendMessage } from '../services/evolution.js';

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
    };
    messageTimestamp: number;
  };
}

webhookRouter.post('/:instanceName', async (req, res) => {
  try {
    const { instanceName } = req.params;
    const payload: WebhookPayload = req.body;

    // Ignore messages from the bot itself
    if (payload.data?.key?.fromMe) {
      return res.status(200).json({ status: 'ignored', reason: 'fromMe' });
    }

    // Extract message content
    const messageContent = 
      payload.data?.message?.conversation || 
      payload.data?.message?.extendedTextMessage?.text;

    if (!messageContent) {
      return res.status(200).json({ status: 'ignored', reason: 'no content' });
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

    // Save user message
    await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status) 
       VALUES ($1, 'user', $2, $3, 'received')`,
      [agent.id, messageContent, phoneNumber]
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

    res.status(200).json({ status: 'ok', messageId: payload.data.key.id });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
