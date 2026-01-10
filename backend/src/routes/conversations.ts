import { Router } from 'express';
import { query } from '../services/database.js';

export const conversationsRouter = Router();

// Get conversations (grouped by phone number) for an agent
conversationsRouter.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get unique phone numbers with last message and message count
    const result = await query(
      `SELECT 
        phone_number,
        COUNT(*) as message_count,
        MAX(created_at) as last_message_at,
        (SELECT content FROM messages m2 
         WHERE m2.agent_id = $1 AND m2.phone_number = messages.phone_number 
         ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT sender FROM messages m3 
         WHERE m3.agent_id = $1 AND m3.phone_number = messages.phone_number 
         ORDER BY created_at DESC LIMIT 1) as last_sender
       FROM messages 
       WHERE agent_id = $1 
       GROUP BY phone_number 
       ORDER BY MAX(created_at) DESC`,
      [agentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Get messages for a specific conversation (phone number)
conversationsRouter.get('/agent/:agentId/phone/:phoneNumber', async (req, res) => {
  try {
    const { agentId, phoneNumber } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await query(
      `SELECT * FROM messages 
       WHERE agent_id = $1 AND phone_number = $2 
       ORDER BY created_at ASC
       LIMIT $3 OFFSET $4`,
      [agentId, phoneNumber, Number(limit), Number(offset)]
    );
    
    // Get contact info if exists
    const contactResult = await query(
      `SELECT * FROM contacts WHERE phone_number = $1`,
      [phoneNumber]
    );
    
    res.json({
      messages: result.rows,
      contact: contactResult.rows[0] || null,
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Update contact info (name, notes, etc.)
conversationsRouter.put('/contact/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { name, notes, tags } = req.body;
    
    // Upsert contact
    const result = await query(
      `INSERT INTO contacts (phone_number, name, notes, tags) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (phone_number) 
       DO UPDATE SET 
         name = COALESCE($2, contacts.name),
         notes = COALESCE($3, contacts.notes),
         tags = COALESCE($4, contacts.tags),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [phoneNumber, name, notes, tags]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// Get all contacts
conversationsRouter.get('/contacts', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM contacts ORDER BY updated_at DESC`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// Delete conversation (all messages for a phone number and agent)
conversationsRouter.delete('/agent/:agentId/phone/:phoneNumber', async (req, res) => {
  try {
    const { agentId, phoneNumber } = req.params;
    
    // Delete all messages for this conversation
    const result = await query(
      `DELETE FROM messages 
       WHERE agent_id = $1 AND phone_number = $2
       RETURNING id`,
      [agentId, phoneNumber]
    );
    
    res.json({ 
      success: true, 
      deletedCount: result.rowCount 
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});
