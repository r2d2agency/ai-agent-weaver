import axios from 'axios';
import { query } from './database.js';

// Get Evolution API credentials from env or database
export async function getEvolutionCredentials(): Promise<{ apiUrl: string; apiKey: string }> {
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

// Get credentials for a specific agent (uses agent-specific if available, otherwise global)
export async function getAgentEvolutionCredentials(agent: any): Promise<{ apiUrl: string; apiKey: string }> {
  // If agent has its own Evolution credentials, use those
  if (agent.evolution_api_url && agent.evolution_api_key) {
    let apiUrl = agent.evolution_api_url.replace(/\/manager\/?$/, '');
    return { apiUrl, apiKey: agent.evolution_api_key };
  }
  
  // Otherwise fall back to global credentials
  return getEvolutionCredentials();
}

export async function sendMessage(instanceName: string, phoneNumber: string, message: string, agent?: any) {
  try {
    const { apiUrl, apiKey } = agent 
      ? await getAgentEvolutionCredentials(agent)
      : await getEvolutionCredentials();
    
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

// Send multiple text messages with delay between them (for natural conversation)
export async function sendMessagesWithDelay(
  instanceName: string, 
  phoneNumber: string, 
  messages: string[], 
  agent?: any,
  delayMs: number = 1500
) {
  const results = [];
  for (let i = 0; i < messages.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    const result = await sendMessage(instanceName, phoneNumber, messages[i], agent);
    results.push(result);
  }
  return results;
}

// Send media (image/video) via Evolution API
export async function sendMedia(
  instanceName: string, 
  phoneNumber: string, 
  mediaBase64: string,
  mimeType: string,
  caption?: string,
  agent?: any
) {
  try {
    const { apiUrl, apiKey } = agent 
      ? await getAgentEvolutionCredentials(agent)
      : await getEvolutionCredentials();
    
    const isVideo = mimeType.includes('video');
    const endpoint = isVideo ? 'sendVideo' : 'sendImage';
    
    const response = await axios.post(
      `${apiUrl}/message/${endpoint}/${instanceName}`,
      {
        number: phoneNumber,
        [isVideo ? 'video' : 'image']: `data:${mimeType};base64,${mediaBase64}`,
        caption: caption || ''
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
    console.error('Evolution API send media error:', error);
    throw error;
  }
}

export async function downloadMediaForAgent(instanceName: string, messageId: string, agent: any): Promise<string | null> {
  try {
    const { apiUrl, apiKey } = await getAgentEvolutionCredentials(agent);
    
    // Evolution API v2 uses POST with JSON body
    const response = await axios.post(
      `${apiUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        message: {
          key: {
            id: messageId
          }
        },
        convertToMp4: false
      },
      {
        headers: { 
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 60000,
      }
    );

    // Normalize base64 across Evolution versions
    const extractBase64 = (val: any): string | null => {
      if (!val) return null;
      if (typeof val === 'string') return val;
      if (typeof val.base64 === 'string') return val.base64;
      if (typeof val.data?.base64 === 'string') return val.data.base64;
      if (typeof val.data === 'string') return val.data;
      return null;
    };

    const raw = extractBase64(response.data);
    if (!raw) {
      console.log('Media download response structure:', Object.keys(response.data || {}));
      return null;
    }

    let b64 = raw.trim();
    const marker = 'base64,';
    const markerIndex = b64.indexOf(marker);
    if (b64.startsWith('data:') && markerIndex !== -1) {
      b64 = b64.slice(markerIndex + marker.length);
    }

    // Remove whitespace/newlines (some gateways split base64 lines)
    b64 = b64.replace(/\s+/g, '');
    return b64;
  } catch (error: any) {
    console.error('Error downloading media:', error.response?.data || error.message);
    return null;
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
