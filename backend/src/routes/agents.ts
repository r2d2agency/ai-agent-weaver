import { Router } from 'express';
import { query } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import { generateTestResponse } from '../services/openai.js';

export const agentsRouter = Router();

// List all agents
agentsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM agents ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// Get single agent
agentsRouter.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM agents WHERE id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// Create agent
agentsRouter.post('/', async (req, res) => {
  try {
    const { name, description, prompt, instanceName, webhookUrl, token } = req.body;
    
    const result = await query(
      `INSERT INTO agents (name, description, prompt, instance_name, webhook_url, token, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'offline')
       RETURNING *`,
      [name, description, prompt, instanceName, webhookUrl, token]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Update agent
agentsRouter.put('/:id', async (req, res) => {
  try {
    const { 
      name, description, prompt, instanceName, webhookUrl, token, status, 
      audioEnabled, widgetEnabled, ghostMode, takeoverTimeout,
      inactivityEnabled, inactivityTimeout, inactivityMessage 
    } = req.body;
    
    const result = await query(
      `UPDATE agents 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           prompt = COALESCE($3, prompt),
           instance_name = COALESCE($4, instance_name),
           webhook_url = COALESCE($5, webhook_url),
           token = COALESCE($6, token),
           status = COALESCE($7, status),
           audio_enabled = COALESCE($8, audio_enabled),
           widget_enabled = COALESCE($9, widget_enabled),
           ghost_mode = COALESCE($10, ghost_mode),
           takeover_timeout = COALESCE($11, takeover_timeout),
           inactivity_enabled = COALESCE($12, inactivity_enabled),
           inactivity_timeout = COALESCE($13, inactivity_timeout),
           inactivity_message = COALESCE($14, inactivity_message),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15
       RETURNING *`,
      [name, description, prompt, instanceName, webhookUrl, token, status, audioEnabled, widgetEnabled, ghostMode, takeoverTimeout, inactivityEnabled, inactivityTimeout, inactivityMessage, req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// Toggle agent status
agentsRouter.patch('/:id/toggle', async (req, res) => {
  try {
    const result = await query(
      `UPDATE agents 
       SET status = CASE WHEN status = 'online' THEN 'offline' ELSE 'online' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling agent:', error);
    res.status(500).json({ error: 'Failed to toggle agent' });
  }
});

// Test agent with a message
agentsRouter.post('/:id/test', async (req, res) => {
  try {
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get the agent
    const agentResult = await query(
      `SELECT * FROM agents WHERE id = $1`,
      [req.params.id]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const agent = agentResult.rows[0];
    
    // Generate response using OpenAI
    const response = await generateTestResponse(agent, message, history || []);
    
    res.json({ response });
  } catch (error) {
    console.error('Error testing agent:', error);
    res.status(500).json({ error: 'Failed to test agent: ' + (error instanceof Error ? error.message : 'Unknown error') });
  }
});

// Delete agent
agentsRouter.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM agents WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});
