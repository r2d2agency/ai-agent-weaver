import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

export async function sendMessage(instanceName: string, phoneNumber: string, message: string) {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${instanceName}`,
      {
        number: phoneNumber,
        text: message,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
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
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`,
      {
        headers: {
          'apikey': EVOLUTION_API_KEY,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Evolution API status error:', error);
    throw error;
  }
}
