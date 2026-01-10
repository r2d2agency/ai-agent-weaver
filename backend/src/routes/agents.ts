import { Router } from 'express';
import { query } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import { generateTestResponse } from '../services/openai.js';
import { testEvolutionConnection, testInstanceConnection } from '../services/evolution.js';

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
      audioEnabled, imageEnabled, documentEnabled, widgetEnabled, ghostMode, takeoverTimeout,
      inactivityEnabled, inactivityTimeout, inactivityMessage,
      operatingHoursEnabled, operatingHoursStart, operatingHoursEnd, operatingHoursTimezone, outOfHoursMessage,
      evolutionApiUrl, evolutionApiKey, openaiApiKey, openaiModel,
      widgetAvatarUrl, widgetPosition, widgetTitle, widgetPrimaryColor, widgetSecondaryColor, widgetBackgroundColor, widgetTextColor,
      audioResponseEnabled, audioResponseVoice, notificationNumber
    } = req.body;
    
    // Helper to convert undefined to null for proper COALESCE behavior
    const toNull = (val: any) => val === undefined ? null : val;
    
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
           image_enabled = COALESCE($9, image_enabled),
           document_enabled = COALESCE($10, document_enabled),
           widget_enabled = COALESCE($11, widget_enabled),
           ghost_mode = COALESCE($12, ghost_mode),
           takeover_timeout = COALESCE($13, takeover_timeout),
           inactivity_enabled = COALESCE($14, inactivity_enabled),
           inactivity_timeout = COALESCE($15, inactivity_timeout),
           inactivity_message = COALESCE($16, inactivity_message),
           operating_hours_enabled = COALESCE($17, operating_hours_enabled),
           operating_hours_start = COALESCE($18, operating_hours_start),
           operating_hours_end = COALESCE($19, operating_hours_end),
           operating_hours_timezone = COALESCE($20, operating_hours_timezone),
           out_of_hours_message = COALESCE($21, out_of_hours_message),
           evolution_api_url = COALESCE($22, evolution_api_url),
           evolution_api_key = COALESCE($23, evolution_api_key),
           openai_api_key = COALESCE($24, openai_api_key),
           openai_model = COALESCE($25, openai_model),
           widget_avatar_url = COALESCE($26, widget_avatar_url),
           widget_position = COALESCE($27, widget_position),
           widget_title = COALESCE($28, widget_title),
           widget_primary_color = COALESCE($29, widget_primary_color),
           widget_secondary_color = COALESCE($30, widget_secondary_color),
           widget_background_color = COALESCE($31, widget_background_color),
           widget_text_color = COALESCE($32, widget_text_color),
           audio_response_enabled = COALESCE($33, audio_response_enabled),
           audio_response_voice = COALESCE($34, audio_response_voice),
           notification_number = COALESCE($35, notification_number),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $36
       RETURNING *`,
      [
        toNull(name), toNull(description), toNull(prompt), toNull(instanceName), 
        toNull(webhookUrl), toNull(token), toNull(status), toNull(audioEnabled), 
        toNull(imageEnabled), toNull(documentEnabled), toNull(widgetEnabled), 
        toNull(ghostMode), toNull(takeoverTimeout), toNull(inactivityEnabled), 
        toNull(inactivityTimeout), toNull(inactivityMessage), toNull(operatingHoursEnabled), 
        toNull(operatingHoursStart), toNull(operatingHoursEnd), toNull(operatingHoursTimezone), 
        toNull(outOfHoursMessage), toNull(evolutionApiUrl), toNull(evolutionApiKey), 
        toNull(openaiApiKey), toNull(openaiModel), toNull(widgetAvatarUrl), 
        toNull(widgetPosition), toNull(widgetTitle), toNull(widgetPrimaryColor), 
        toNull(widgetSecondaryColor), toNull(widgetBackgroundColor), toNull(widgetTextColor),
        toNull(audioResponseEnabled), toNull(audioResponseVoice), toNull(notificationNumber),
        req.params.id
      ]
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

// Test agent Evolution connection
agentsRouter.post('/:id/test-evolution', async (req, res) => {
  try {
    const { evolutionApiUrl, evolutionApiKey, instanceName } = req.body;
    
    if (!evolutionApiUrl || !evolutionApiKey) {
      return res.status(400).json({ error: 'Evolution API URL and Key are required' });
    }

    // First test the API connection
    const apiResult = await testEvolutionConnection(evolutionApiUrl, evolutionApiKey);
    
    if (!apiResult.success) {
      return res.json({ 
        success: false, 
        error: apiResult.error || 'Failed to connect to Evolution API'
      });
    }

    // If instance name provided, test that specific instance
    if (instanceName) {
      // Clean the URL
      const cleanUrl = evolutionApiUrl.replace(/\/manager\/?$/, '');
      
      const axios = (await import('axios')).default;
      try {
        const response = await axios.get(
          `${cleanUrl}/instance/connectionState/${instanceName}`,
          {
            headers: { 'apikey': evolutionApiKey },
            timeout: 10000,
          }
        );
        
        const state = response.data?.instance?.state || response.data?.state;
        const connected = state === 'open' || state === 'connected';
        
        return res.json({
          success: true,
          connected,
          state,
          message: connected 
            ? `Instância "${instanceName}" está conectada ao WhatsApp!` 
            : `Instância "${instanceName}" encontrada mas não está conectada ao WhatsApp. Estado: ${state}`
        });
      } catch (instanceError: any) {
        return res.json({
          success: true,
          connected: false,
          error: `API conectada, mas instância "${instanceName}" não encontrada ou com erro.`
        });
      }
    }

    return res.json({ 
      success: true, 
      message: 'Conexão com Evolution API estabelecida com sucesso!'
    });
  } catch (error) {
    console.error('Error testing Evolution connection:', error);
    res.status(500).json({ error: 'Failed to test connection' });
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
