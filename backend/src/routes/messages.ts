import { Router } from 'express';
import { query } from '../services/database.js';

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
