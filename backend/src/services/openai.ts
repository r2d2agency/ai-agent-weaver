import OpenAI from 'openai';
import { query } from './database.js';

let globalOpenaiClient: OpenAI | null = null;

// Get global OpenAI client (fallback)
async function getGlobalOpenAIClient(): Promise<OpenAI> {
  if (!globalOpenaiClient) {
    let apiKey = process.env.OPENAI_API_KEY;
    
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
    globalOpenaiClient = new OpenAI({ apiKey });
  }
  return globalOpenaiClient;
}

// Get OpenAI client for a specific agent (uses agent's key if available)
async function getAgentOpenAIClient(agent: AgentWithConfig): Promise<OpenAI> {
  if (agent.openai_api_key) {
    return new OpenAI({ apiKey: agent.openai_api_key });
  }
  return getGlobalOpenAIClient();
}

// Reset global client when settings change
export function resetOpenAIClient() {
  globalOpenaiClient = null;
}

interface Agent {
  id: string;
  name: string;
  prompt: string;
}

interface AgentWithConfig extends Agent {
  openai_api_key?: string;
  openai_model?: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export async function generateResponse(
  agent: AgentWithConfig, 
  userMessage: string, 
  phoneNumber: string,
  imageBase64?: string
): Promise<string> {
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

    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || process.env.OPENAI_MODEL || 'gpt-4o';

    // Build user message content (text or multimodal with image)
    let userContent: string | MessageContent[];
    if (imageBase64) {
      userContent = [
        { type: 'text' as const, text: userMessage },
        { type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ];
    } else {
      userContent = userMessage;
    }

    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userContent as any },
      ],
    });

    return response.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error('OpenAI error:', error);
    throw error;
  }
}

// Generate test response for the chat testing feature
export async function generateTestResponse(agent: AgentWithConfig, userMessage: string, history: HistoryMessage[]): Promise<string> {
  try {
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

    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || process.env.OPENAI_MODEL || 'gpt-4o';
    
    const response = await client.chat.completions.create({
      model,
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

// Transcribe audio to text using Whisper
export async function transcribeAudio(
  agent: AgentWithConfig,
  audioBuffer: Buffer,
  mimeType: string = 'audio/ogg',
  fileName?: string
): Promise<string> {
  try {
    const client = await getAgentOpenAIClient(agent);

    const cleanMimeType = (mimeType || 'audio/ogg').split(';')[0].trim() || 'audio/ogg';

    const inferredName = (() => {
      if (fileName) return fileName;
      if (cleanMimeType.includes('mp3') || cleanMimeType.includes('mpeg')) return 'audio.mp3';
      if (cleanMimeType.includes('mp4') || cleanMimeType.includes('m4a')) return 'audio.m4a';
      if (cleanMimeType.includes('wav')) return 'audio.wav';
      if (cleanMimeType.includes('webm')) return 'audio.webm';
      return 'audio.ogg';
    })();

    // Avoid depending on DOM lib types in TypeScript
    const FileCtor = (globalThis as any).File;
    if (!FileCtor) {
      throw new Error('Global File constructor not available. Please run on Node 18+');
    }

    const audioFile = new FileCtor([audioBuffer], inferredName, { type: cleanMimeType });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
    });

    return transcription.text;
  } catch (error) {
    console.error('Whisper transcription error:', error);
    throw error;
  }
}

// Analyze image using GPT-4 Vision
export async function analyzeImage(agent: AgentWithConfig, imageBase64: string, prompt?: string): Promise<string> {
  try {
    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || 'gpt-4o';
    
    const analysisPrompt = prompt || 'Descreva detalhadamente o conteúdo desta imagem. Se houver texto, transcreva-o.';
    
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: analysisPrompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }
      ],
    });

    return response.choices[0]?.message?.content || 'Não foi possível analisar a imagem.';
  } catch (error) {
    console.error('Image analysis error:', error);
    throw error;
  }
}

// Extract text from PDF using GPT-4 Vision (page by page as images)
export async function analyzePDF(agent: AgentWithConfig, pdfBase64: string): Promise<string> {
  try {
    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || 'gpt-4o';
    
    // For now, we'll ask GPT to analyze the PDF as a document
    // In production, you might want to convert PDF pages to images first
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: 'Este é um documento PDF. Por favor, extraia e resuma o conteúdo principal. Se houver texto visível, transcreva-o.' 
            },
            { 
              type: 'image_url', 
              image_url: { url: `data:application/pdf;base64,${pdfBase64}` } 
            }
          ]
        }
      ],
    });

    return response.choices[0]?.message?.content || 'Não foi possível analisar o documento.';
  } catch (error) {
    console.error('PDF analysis error:', error);
    // If PDF analysis fails, return a helpful message
    return '[Documento recebido - análise de PDF requer conversão para imagem]';
  }
}

// Generate response for widget chat (public endpoint)
export async function generateWidgetResponse(agent: AgentWithConfig, userMessage: string, sessionId: string, history: HistoryMessage[]): Promise<string> {
  try {
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

    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || process.env.OPENAI_MODEL || 'gpt-4o';
    
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userMessage },
      ],
    });

    return response.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.';
  } catch (error) {
    console.error('OpenAI widget error:', error);
    throw error;
  }
}
