import { Router } from 'express';
import { query } from '../services/database.js';
import { sendMessage, getAgentEvolutionCredentials } from '../services/evolution.js';

export const messagesRouter = Router();

// List all messages (with optional filters)
messagesRouter.get('/', async (req, res) => {
  try {
    const { agentId, phoneNumber, limit = 100 } = req.query;
    
    let sql = `
      SELECT m.*, a.name as agent_name 
      FROM messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (agentId) {
      params.push(agentId);
      sql += ` AND m.agent_id = $${params.length}`;
    }
    
    if (phoneNumber) {
      params.push(phoneNumber);
      sql += ` AND m.phone_number = $${params.length}`;
    }
    
    params.push(Number(limit));
    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing messages:', error);
    res.status(500).json({ error: 'Failed to list messages' });
  }
});

// Get conversation by phone number
messagesRouter.get('/conversation/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { agentId } = req.query;
    
    let sql = `
      SELECT m.*, a.name as agent_name 
      FROM messages m
      LEFT JOIN agents a ON m.agent_id = a.id
      WHERE m.phone_number = $1
    `;
    const params: any[] = [phoneNumber];
    
    if (agentId) {
      params.push(agentId);
      sql += ` AND m.agent_id = $${params.length}`;
    }
    
    sql += ` ORDER BY m.created_at ASC`;
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Get message stats
messagesRouter.get('/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT phone_number) as unique_contacts,
        COUNT(CASE WHEN sender = 'user' THEN 1 END) as user_messages,
        COUNT(CASE WHEN sender = 'agent' THEN 1 END) as agent_messages,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h
      FROM messages
    `);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Send message manually (from platform)
messagesRouter.post('/send', async (req, res) => {
  try {
    const { agentId, phoneNumber, content } = req.body;

    if (!agentId || !phoneNumber || !content) {
      return res.status(400).json({ error: 'agentId, phoneNumber and content are required' });
    }

    // Get agent
    const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = agentResult.rows[0];
    const instanceName = agent.instance_name;

    if (!instanceName) {
      return res.status(400).json({ error: 'Agent has no instance configured' });
    }

    // Send message via Evolution API
    await sendMessage(instanceName, phoneNumber, content, agent);

    // Save message to database
    const messageResult = await query(
      `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
       VALUES ($1, 'owner', $2, $3, 'sent', true)
       RETURNING *`,
      [agentId, content, phoneNumber]
    );

    // Update or insert takeover timestamp (pause AI for this conversation)
    await query(
      `INSERT INTO conversation_takeover (agent_id, phone_number, taken_over_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (agent_id, phone_number) 
       DO UPDATE SET taken_over_at = CURRENT_TIMESTAMP`,
      [agentId, phoneNumber]
    );

    // Update agent messages count
    await query(
      `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [agentId]
    );

    console.log(`Manual message sent to ${phoneNumber} via ${instanceName}`);
    res.json({ success: true, message: messageResult.rows[0] });
  } catch (error: any) {
    console.error('Error sending manual message:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});
