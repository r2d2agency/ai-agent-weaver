import axios from 'axios';
import { query } from './database.js';

// Get Evolution API credentials from env or database
async function getEvolutionCredentials(): Promise<{ apiUrl: string; apiKey: string }> {
  let apiUrl = process.env.EVOLUTION_API_URL;
  let apiKey = process.env.EVOLUTION_API_KEY;

  // If not in env, try to get from database settings
  if (!apiUrl || !apiKey) {
    try {
      const urlResult = await query(`SELECT value FROM settings WHERE key = 'evolution_api_url'`);
      const keyResult = await query(`SELECT value FROM settings WHERE key = 'evolution_api_key'`);
      
      if (urlResult.rows.length > 0) apiUrl = urlResult.rows[0].value;
      if (keyResult.rows.length > 0) apiKey = keyResult.rows[0].value;
    } catch (error) {
      console.error('Error fetching Evolution credentials from settings:', error);
    }
  }

  if (!apiUrl || !apiKey) {
    throw new Error('Evolution API credentials not configured. Please add them in Settings.');
  }

  // Remove /manager from URL if present
  apiUrl = apiUrl.replace(/\/manager\/?$/, '');

  return { apiUrl, apiKey };
}

export async function sendMessage(instanceName: string, phoneNumber: string, message: string) {
  try {
    const { apiUrl, apiKey } = await getEvolutionCredentials();
    
    const response = await axios.post(
      `${apiUrl}/message/sendText/${instanceName}`,
      {
        number: phoneNumber,
        text: message,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Evolution API error:', error);
    throw error;
  }
}

export async function getInstanceStatus(instanceName: string) {
  try {
    const { apiUrl, apiKey } = await getEvolutionCredentials();
    
    const response = await axios.get(
      `${apiUrl}/instance/connectionState/${instanceName}`,
      {
        headers: {
          'apikey': apiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Evolution API status error:', error);
    throw error;
  }
}

export async function fetchAllInstances() {
  try {
    const { apiUrl, apiKey } = await getEvolutionCredentials();
    
    const response = await axios.get(
      `${apiUrl}/instance/fetchInstances`,
      {
        headers: {
          'apikey': apiKey,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Evolution API fetch instances error:', error);
    throw error;
  }
}

// Test connection with custom credentials
export async function testEvolutionConnection(apiUrl: string, apiKey: string) {
  try {
    // Remove /manager from URL if present
    const cleanUrl = apiUrl.replace(/\/manager\/?$/, '');
    
    const response = await axios.get(
      `${cleanUrl}/instance/fetchInstances`,
      {
        headers: {
          'apikey': apiKey,
        },
        timeout: 10000,
      }
    );

    return { success: true, instances: response.data };
  } catch (error: any) {
    console.error('Evolution test connection error:', error.message);
    return { success: false, error: error.message || 'Connection failed' };
  }
}

// Test specific instance connection
export async function testInstanceConnection(instanceName: string) {
  try {
    const { apiUrl, apiKey } = await getEvolutionCredentials();
    
    const response = await axios.get(
      `${apiUrl}/instance/connectionState/${instanceName}`,
      {
        headers: {
          'apikey': apiKey,
        },
        timeout: 10000,
      }
    );

    const state = response.data?.instance?.state || response.data?.state;
    const connected = state === 'open' || state === 'connected';

    return { 
      success: true, 
      connected,
      state,
      data: response.data 
    };
  } catch (error: any) {
    console.error('Instance test connection error:', error.message);
    return { success: false, error: error.message || 'Connection failed' };
  }
}
