import OpenAI from 'openai';
import { query } from './database.js';

let openaiClient: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI> {
  if (!openaiClient) {
    // First try environment variable
    let apiKey = process.env.OPENAI_API_KEY;
    
    // If not in env, try to get from database settings
    if (!apiKey) {
      try {
        const result = await query(`SELECT value FROM settings WHERE key = 'openai_api_key'`);
        if (result.rows.length > 0 && result.rows[0].value) {
          apiKey = result.rows[0].value;
        }
      } catch (error) {
        console.error('Error fetching OpenAI API key from settings:', error);
      }
    }
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured. Please add it in Settings.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Reset client when settings change
export function resetOpenAIClient() {
  openaiClient = null;
}

interface Agent {
  id: string;
  name: string;
  prompt: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function generateResponse(agent: Agent, userMessage: string, phoneNumber: string): Promise<string> {
  try {
    // Get conversation history
    const historyResult = await query(
      `SELECT sender, content FROM messages 
       WHERE agent_id = $1 AND phone_number = $2 
       ORDER BY created_at DESC LIMIT 10`,
      [agent.id, phoneNumber]
    );

    const history = historyResult.rows.reverse().map((msg: any) => ({
      role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: msg.content,
    }));

    // Get agent documents for context (RAG)
    const docsResult = await query(
      `SELECT content FROM documents WHERE agent_id = $1`,
      [agent.id]
    );
    
    const docsContext = docsResult.rows
      .map((doc: any) => doc.content)
      .filter(Boolean)
      .join('\n\n');

    const systemPrompt = docsContext 
      ? `${agent.prompt}\n\nContexto adicional dos documentos:\n${docsContext}`
      : agent.prompt;

    const client = await getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_completion_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error('OpenAI error:', error);
    throw error;
  }
}

// Generate test response for the chat testing feature
export async function generateTestResponse(agent: Agent, userMessage: string, history: HistoryMessage[]): Promise<string> {
  try {
    // Get agent documents for context (RAG)
    const docsResult = await query(
      `SELECT content FROM documents WHERE agent_id = $1`,
      [agent.id]
    );
    
    const docsContext = docsResult.rows
      .map((doc: any) => doc.content)
      .filter(Boolean)
      .join('\n\n');

    const systemPrompt = docsContext 
      ? `${agent.prompt}\n\nContexto adicional dos documentos:\n${docsContext}`
      : agent.prompt;

    const client = await getOpenAIClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      max_completion_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error('OpenAI test error:', error);
    throw error;
  }
}
