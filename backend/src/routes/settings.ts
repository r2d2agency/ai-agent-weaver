import { Router } from 'express';
import { query } from '../services/database.js';
import { testEvolutionConnection, testInstanceConnection, fetchAllInstances } from '../services/evolution.js';
import { resetOpenAIClient } from '../services/openai.js';

export const settingsRouter = Router();

// Get all settings
settingsRouter.get('/', async (req, res) => {
  try {
    const result = await query(`SELECT key, value FROM settings`);
    
    const settings: Record<string, string> = {};
    result.rows.forEach((row: any) => {
      settings[row.key] = row.value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings
settingsRouter.put('/', async (req, res) => {
  try {
    const settings = req.body;
    
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (key) 
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, value as string]
      );
    }

    // Reset OpenAI client to use new API key
    resetOpenAIClient();
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Test Evolution API connection
settingsRouter.post('/test-evolution', async (req, res) => {
  try {
    const { apiUrl, apiKey } = req.body;
    
    if (!apiUrl || !apiKey) {
      return res.status(400).json({ success: false, error: 'URL and API Key are required' });
    }

    const result = await testEvolutionConnection(apiUrl, apiKey);
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: 'Connection failed' });
  }
});

// Test specific Evolution instance
settingsRouter.post('/test-instance', async (req, res) => {
  try {
    const { instanceName } = req.body;
    
    if (!instanceName) {
      return res.status(400).json({ success: false, error: 'Instance name is required' });
    }

    const result = await testInstanceConnection(instanceName);
    res.json(result);
  } catch (error: any) {
    res.json({ success: false, error: error.message || 'Connection failed' });
  }
});

// Get all Evolution instances
settingsRouter.get('/instances', async (req, res) => {
  try {
    const instances = await fetchAllInstances();
    res.json({ success: true, instances });
  } catch (error: any) {
    res.json({ success: false, error: error.message || 'Failed to fetch instances' });
  }
});

// Test OpenAI connection
settingsRouter.post('/test-openai', async (req, res) => {
  try {
    const { apiKey } = req.body;
    
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    
    if (response.ok) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Invalid API key' });
    }
  } catch (error) {
    res.json({ success: false, error: 'Connection failed' });
  }
});
