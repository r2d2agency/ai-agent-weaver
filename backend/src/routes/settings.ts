import { Router } from 'express';
import { query } from '../services/database.js';

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
    
    const response = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: { 'apikey': apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      res.json({ success: true, instances: data });
    } else {
      res.json({ success: false, error: 'Invalid API credentials' });
    }
  } catch (error) {
    res.json({ success: false, error: 'Connection failed' });
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
