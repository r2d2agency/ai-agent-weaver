import OpenAI from 'openai';
import { query } from './database.js';

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not configured');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

interface Agent {
  id: string;
  name: string;
  prompt: string;
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

    const response = await getOpenAIClient().chat.completions.create({
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
