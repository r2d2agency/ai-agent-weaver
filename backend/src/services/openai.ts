import OpenAI from 'openai';
import { query } from './database.js';
import { createLog } from '../routes/logs.js';

let globalOpenaiClient: OpenAI | null = null;

// Get current date/time in Brasilia timezone
function getBrasiliaDateTime(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatter.format(now);
}

function getDateTimeContext(): string {
  const dateTime = getBrasiliaDateTime();
  return `\n\n[INFORMAÇÃO DO SISTEMA - Data e Hora Atual (Horário de Brasília): ${dateTime}]\n`;
}

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
  audio_response_enabled?: boolean;
  audio_response_voice?: string;
  notification_number?: string;
  transfer_instructions?: string;
  instance_name?: string;
  required_fields?: { key: string; question: string }[];
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

interface MediaItem {
  id: string;
  name: string;
  description: string;
  type: 'image' | 'gallery' | 'video';
  file_urls: string[];
  mime_types: string[];
}

interface ResponseWithMedia {
  text: string;
  mediaToSend?: MediaItem[];
  notifyHuman?: {
    reason: string;
    conversationHistory: string;
    orderDetails?: string;
    customerName?: string;
    customerPhone: string;
  };
  collectedData?: Record<string, string>;
}

// Get or create contact for storing collected data
async function getContactCollectedData(phoneNumber: string): Promise<Record<string, string>> {
  try {
    const result = await query(
      `SELECT collected_data FROM contacts WHERE phone_number = $1`,
      [phoneNumber]
    );
    if (result.rows.length > 0 && result.rows[0].collected_data) {
      return result.rows[0].collected_data;
    }
  } catch (error) {
    console.error('Error fetching contact collected data:', error);
  }
  return {};
}

// Save collected data to contact
async function saveContactCollectedData(phoneNumber: string, data: Record<string, string>): Promise<void> {
  try {
    await query(
      `INSERT INTO contacts (phone_number, collected_data) 
       VALUES ($1, $2)
       ON CONFLICT (phone_number) 
       DO UPDATE SET 
         collected_data = contacts.collected_data || $2,
         updated_at = CURRENT_TIMESTAMP`,
      [phoneNumber, JSON.stringify(data)]
    );
  } catch (error) {
    console.error('Error saving contact collected data:', error);
  }
}

// Get media context for agent prompt
async function getMediaContext(agentId: string): Promise<{ context: string; items: MediaItem[] }> {
  const result = await query(
    `SELECT id, name, description, media_type as type, file_urls, mime_types FROM agent_media WHERE agent_id = $1`,
    [agentId]
  );
  
  const items = result.rows as MediaItem[];
  if (items.length === 0) {
    return { context: '', items: [] };
  }
  
  const mediaList = items.map((m, i) => 
    `${i + 1}. [${m.type.toUpperCase()}] "${m.name}" - ${m.description}`
  ).join('\n');
  
  const context = `\n\n## Galeria de Produtos/Mídia Disponível:\n${mediaList}\n\n## REGRAS OBRIGATÓRIAS PARA ENVIO DE MÍDIA:
1. NUNCA use markdown para imagens (como ![nome](url)). Isso NÃO funciona.
2. SEMPRE use a função/tool "send_media" quando quiser enviar fotos ou vídeos.
3. Quando o usuário perguntar sobre um produto, chame a função send_media com o nome da mídia.
4. Use a descrição para identificar qual mídia corresponde à pergunta do usuário.
5. Se não encontrar a mídia, informe que não tem imagem disponível.

Exemplo correto: Chamar send_media com media_names: ["PETRO POWER 150"]
Exemplo ERRADO: Escrever ![PETRO POWER 150](url) no texto`;
  
  return { context, items };
}

// Product catalog interface
interface ProductItem {
  id: string;
  name: string;
  description: string;
  // NOTE: Postgres DECIMAL/NUMERIC often comes as string (pg driver default)
  price: number | string;
  category: string | null;
  sku: string | null;
  stock: number | null;
  is_active: boolean;
}


// Get products context for agent prompt
async function getProductsContext(agentId: string): Promise<{ context: string; items: ProductItem[] }> {
  let items: ProductItem[] = [];

  try {
    const result = await query(
      `SELECT id, name, description, price, category, sku, stock, is_active 
       FROM agent_products 
       WHERE agent_id = $1 AND is_active = true 
       ORDER BY category, name`,
      [agentId]
    );

    items = result.rows as ProductItem[];
  } catch (error) {
    // If the table doesn't exist yet (migration not applied) or any DB issue occurs,
    // don't break the whole AI flow.
    console.error('Error fetching products context:', error);
    return { context: '', items: [] };
  }

  if (items.length === 0) {
    return { context: '', items: [] };
  }

  
  // Group by category
  const byCategory: Record<string, ProductItem[]> = {};
  for (const item of items) {
    const cat = item.category || 'Sem Categoria';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  
  let productList = '';
  for (const [category, products] of Object.entries(byCategory)) {
    productList += `\n### ${category}:\n`;
    for (const p of products) {
      const stockInfo = p.stock !== null ? ` (Estoque: ${p.stock})` : '';
      const priceNumber = typeof p.price === 'number' ? p.price : parseFloat(String(p.price));
      const priceLabel = Number.isFinite(priceNumber) ? priceNumber.toFixed(2) : '0.00';
      productList += `- "${p.name}" - R$ ${priceLabel}${stockInfo}\n`;
      if (p.description) productList += `  Descrição: ${p.description}\n`;
    }
  }

  
  const context = `\n\n## 📦 Catálogo de Produtos Disponíveis:\n${productList}

## REGRAS PARA CONSULTA E CÁLCULO DE PRODUTOS:
1. Use a função "calculate_order" para calcular o total de um pedido com múltiplos produtos.
2. Sempre confirme os produtos e quantidades com o cliente antes de calcular.
3. Se o cliente perguntar preço, informe o valor unitário do catálogo acima.
4. Para pedidos, some os valores usando calculate_order passando a lista de produtos e quantidades.
5. Se um produto não estiver no catálogo, informe que não está disponível.

Exemplo de uso: calculate_order com items: [{"name": "Produto X", "quantity": 2}, {"name": "Produto Y", "quantity": 1}]`;
  
  return { context, items };
}

// Tool for calculating orders
const calculateOrderTool = {
  type: 'function' as const,
  function: {
    name: 'calculate_order',
    description: 'Calcula o total de um pedido com base nos produtos e quantidades informados. Use quando o cliente quiser saber o valor total de múltiplos produtos ou confirmar um pedido.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Nome exato do produto (conforme listado no catálogo)'
              },
              quantity: {
                type: 'number',
                description: 'Quantidade do produto'
              }
            },
            required: ['name', 'quantity']
          },
          description: 'Lista de produtos com suas quantidades'
        }
      },
      required: ['items']
    }
  }
};

// Tools for media sending
const mediaTools = [
  {
    type: 'function' as const,
    function: {
      name: 'send_media',
      description: 'Envia fotos ou vídeos de produtos para o usuário. Use quando o usuário perguntar sobre um produto específico ou pedir para ver imagens/vídeos.',
      parameters: {
        type: 'object',
        properties: {
          media_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista com os nomes exatos das mídias a serem enviadas (conforme listado na galeria)'
          },
          message: {
            type: 'string',
            description: 'Mensagem de texto para acompanhar as mídias (opcional)'
          }
        },
        required: ['media_names']
      }
    }
  }
];

// Tool for notifying a human operator
const notifyHumanTool = {
  type: 'function' as const,
  function: {
    name: 'notify_human',
    description: 'Notifica um atendente humano via WhatsApp quando você precisa transferir o atendimento ou quando a situação requer intervenção humana. Use quando: o cliente pedir para falar com um humano, quando não conseguir resolver o problema, quando precisar confirmar um pedido/compra, ou quando a situação for complexa demais. IMPORTANTE: Antes de usar esta função, verifique se todas as variáveis obrigatórias foram coletadas.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Motivo da transferência (ex: "Cliente solicitou atendimento humano", "Confirmação de pedido", "Situação complexa que requer análise manual")'
        },
        conversation_history: {
          type: 'string',
          description: 'Histórico COMPLETO da conversa formatado como: "Cliente: mensagem\\nAgente: resposta\\n..." - inclua TODAS as mensagens trocadas'
        },
        order_details: {
          type: 'string',
          description: 'Detalhes do pedido/compra se aplicável (produtos, quantidades, valores, endereço, forma de pagamento, etc.)'
        },
        customer_name: {
          type: 'string',
          description: 'Nome do cliente (se mencionado na conversa)'
        },
        collected_data: {
          type: 'object',
          description: 'Dados coletados do cliente (as variáveis obrigatórias preenchidas). Ex: { "nome": "João Silva", "cpf": "123.456.789-00" }',
          additionalProperties: { type: 'string' }
        }
      },
      required: ['reason', 'conversation_history']
    }
  }
};

// Tool for collecting customer information
const collectInfoTool = {
  type: 'function' as const,
  function: {
    name: 'collect_customer_info',
    description: 'Registra informações coletadas do cliente durante a conversa. Use sempre que o cliente fornecer dados importantes como nome, CPF, endereço, etc. Isso ajuda a manter um registro organizado.',
    parameters: {
      type: 'object',
      properties: {
        field_key: {
          type: 'string',
          description: 'Chave/nome da variável (ex: "nome", "cpf", "endereco")'
        },
        field_value: {
          type: 'string',
          description: 'Valor fornecido pelo cliente'
        }
      },
      required: ['field_key', 'field_value']
    }
  }
};

export async function generateResponse(
  agent: AgentWithConfig, 
  userMessage: string, 
  phoneNumber: string,
  imageBase64?: string
): Promise<ResponseWithMedia> {
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

    // Get media context
    const { context: mediaContext, items: mediaItems } = await getMediaContext(agent.id);

    // Get products context
    const { context: productsContext, items: productItems } = await getProductsContext(agent.id);

    // Build system prompt with instructions for natural responses
    const naturalResponseInstruction = `

IMPORTANTE: Responda de forma natural e humana. Quebre suas respostas em mensagens curtas quando apropriado.
- Use frases curtas e diretas
- Não envie blocos grandes de texto
- Separe ideias diferentes com "---" para que sejam enviadas como mensagens separadas
- Seja conversacional e amigável`;

    // Add date/time context to system prompt
    const dateTimeContext = getDateTimeContext();
    
    let systemPrompt = agent.prompt + dateTimeContext + naturalResponseInstruction;
    
    if (docsContext) {
      systemPrompt += `\n\nContexto adicional dos documentos:\n${docsContext}`;
    }
    
    if (mediaContext) {
      systemPrompt += mediaContext;
    }

    if (productsContext) {
      systemPrompt += productsContext;
    }

    // Build conversation history summary for notify_human
    const historyForSummary = history
      .map((msg, i) => `${msg.role === 'user' ? 'Cliente' : 'Agente'}: ${msg.content}`)
      .join('\n');

// Get collected data for this contact
    const collectedData = await getContactCollectedData(phoneNumber);
    const requiredFields = agent.required_fields || [];

    // Check if there was already a transfer for this conversation
    const transferCheckResult = await query(
      `SELECT takeover_until FROM conversation_activity 
       WHERE agent_id = $1 AND phone_number = $2 
       AND takeover_until > CURRENT_TIMESTAMP`,
      [agent.id, phoneNumber]
    );
    const alreadyTransferred = transferCheckResult.rows.length > 0;

    // Add notify_human context if notification number is configured
    if (agent.notification_number) {
      // Build custom instructions section
      const customInstructions = agent.transfer_instructions 
        ? `\n\n### Instruções Personalizadas do Negócio:\n${agent.transfer_instructions}\n`
        : '';

      // Build required fields section
      let requiredFieldsContext = '';
      if (requiredFields.length > 0) {
        const fieldsStatus = requiredFields.map(f => {
          const value = collectedData[f.key];
          return `- ${f.key}: ${value ? `✓ "${value}"` : `❌ NÃO COLETADO (pergunte: "${f.question}")`}`;
        }).join('\n');

        const missingFields = requiredFields.filter(f => !collectedData[f.key]);
        
        requiredFieldsContext = `\n\n### Variáveis Obrigatórias para Transferência:
${fieldsStatus}

${missingFields.length > 0 
  ? `⚠️ ATENÇÃO: Existem ${missingFields.length} variável(eis) NÃO COLETADA(S). Antes de usar notify_human, você DEVE perguntar e coletar essas informações do cliente. Use collect_customer_info para registrar cada dado coletado.`
  : '✅ Todas as variáveis obrigatórias foram coletadas. Você pode prosseguir com notify_human.'}`;
      }

      // Add transfer status context
      const transferStatusContext = alreadyTransferred 
        ? `\n\n### ⚠️ ESTADO DA CONVERSA: JÁ TRANSFERIDO
Este cliente JÁ FOI TRANSFERIDO para um atendente humano nesta conversa.
NÃO CHAME notify_human novamente. O atendente já foi notificado e está ciente.

Se o cliente retornar:
1. Pergunte se deseja ajuda com o pedido/assunto anterior ou se tem algo novo
2. Continue o atendimento normalmente
3. Só transfira novamente se surgir uma situação COMPLETAMENTE NOVA que exija intervenção humana
4. Se o cliente perguntar sobre o status do atendimento anterior, informe que o atendente já foi notificado e entrará em contato`
        : '';

      systemPrompt += `\n\n## Transferência para Atendente Humano:
Você tem a capacidade de notificar um atendente humano via WhatsApp quando necessário.
${transferStatusContext}

Use a função "notify_human" APENAS quando:
- O cliente pedir explicitamente para falar com um humano
- O cliente confirmar um pedido/compra
- Você não conseguir resolver o problema do cliente
- A situação for complexa e requer análise humana
- O cliente estiver insatisfeito ou frustrado
${customInstructions}${requiredFieldsContext}

## Coleta de Informações:
Use a função "collect_customer_info" sempre que o cliente fornecer dados importantes. Isso mantém um registro organizado e ajuda na transferência.

IMPORTANTE: Ao usar notify_human, forneça:
- reason: Motivo claro (ex: "Confirmação de pedido", "Transferência solicitada", etc.)
- conversation_history: Histórico COMPLETO da conversa. Copie TODAS as mensagens abaixo:

---INÍCIO DO HISTÓRICO---
${historyForSummary}
---FIM DO HISTÓRICO---

Inclua também a mensagem atual do cliente no conversation_history.

- order_details: ${agent.transfer_instructions ? 'SIGA AS INSTRUÇÕES PERSONALIZADAS ACIMA para preencher este campo com as informações relevantes.' : 'Se for um pedido, liste TODOS os detalhes: produtos, quantidades, valores, endereço de entrega, forma de pagamento, observações, etc.'}
- customer_name: Nome do cliente se mencionado na conversa
- collected_data: Inclua todos os dados coletados do cliente`;
    }

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

    // Build tools array based on agent configuration
    const availableTools: any[] = [];
    if (mediaItems.length > 0) {
      availableTools.push(...mediaTools);
    }
    if (productItems.length > 0) {
      availableTools.push(calculateOrderTool);
    }
    if (agent.notification_number) {
      availableTools.push(notifyHumanTool);
      availableTools.push(collectInfoTool);
    }

    let response: any;
    try {
      response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userContent as any },
        ],
        tools: availableTools.length > 0 ? availableTools : undefined,
        tool_choice: availableTools.length > 0 ? 'auto' : undefined,
      });
    } catch (err) {
      // Fallback: if the chosen model/config doesn't support tools or fails, retry without tools
      console.error('OpenAI create failed (retrying without tools):', err);
      response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: userContent as any },
        ],
      });
    }

    const message = response.choices[0]?.message;
    let textResponse = message?.content || '';
    let mediaToSend: MediaItem[] = [];
    let notifyHuman: ResponseWithMedia['notifyHuman'];

    // Check for tool calls
    console.log('=== OpenAI Response Debug ===');
    console.log('Model used:', model);
    console.log('Has tool_calls:', !!message?.tool_calls);
    console.log('Tool calls count:', message?.tool_calls?.length || 0);
    console.log('Text content:', message?.content?.substring(0, 200));
    
    // Log the AI response info
    await createLog(
      agent.id,
      'info',
      'OpenAI Response Received',
      {
        model,
        hasToolCalls: !!message?.tool_calls,
        toolCallsCount: message?.tool_calls?.length || 0,
        textPreview: message?.content?.substring(0, 100) || '',
      },
      phoneNumber,
      'whatsapp'
    );
    
    if (message?.tool_calls && message.tool_calls.length > 0) {
      console.log('=== Tool Calls Details ===');
      let toolSuggestedMessage: string | null = null;

      for (const toolCall of message.tool_calls) {
        console.log('Tool call ID:', toolCall.id);
        console.log('Tool name:', toolCall.function.name);
        console.log('Tool arguments (raw):', toolCall.function.arguments);
        
        if (toolCall.function.name === 'send_media') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('Parsed media_names:', args.media_names);
            console.log('Parsed message:', args.message);
            
            const mediaNames: string[] = args.media_names || [];
            const additionalMessage: string = args.message || '';

            if (additionalMessage) toolSuggestedMessage = additionalMessage;

            console.log(`Tool call send_media with names: ${mediaNames.join(', ')}`);
            console.log('Available media items:', mediaItems.map(m => m.name).join(', '));

            // Log the tool call
            await createLog(
              agent.id,
              'tool_call',
              `Tool: send_media - Buscando "${mediaNames.join(', ')}"`,
              {
                requestedMedia: mediaNames,
                availableMedia: mediaItems.map(m => m.name),
                message: additionalMessage,
              },
              phoneNumber,
              'whatsapp'
            );

            // Find matching media items (more flexible matching)
            for (const name of mediaNames) {
              const found = mediaItems.find(
                m =>
                  m.name.toLowerCase().includes(String(name).toLowerCase()) ||
                  String(name).toLowerCase().includes(m.name.toLowerCase())
              );
              if (found) {
                mediaToSend.push(found);
                console.log(`✓ Found media match: "${name}" -> "${found.name}"`);
                
                // Log successful match
                await createLog(
                  agent.id,
                  'media_match',
                  `Mídia encontrada: "${found.name}"`,
                  {
                    requested: name,
                    matched: found.name,
                    type: found.type,
                    filesCount: found.file_urls?.length || 0,
                  },
                  phoneNumber,
                  'whatsapp'
                );
              } else {
                console.log(`✗ Media not found: "${name}"`);
                
                // Log failed match
                await createLog(
                  agent.id,
                  'error',
                  `Mídia não encontrada: "${name}"`,
                  {
                    requested: name,
                    availableMedia: mediaItems.map(m => m.name),
                  },
                  phoneNumber,
                  'whatsapp'
                );
              }
            }
          } catch (e) {
            console.error('Error parsing tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar tool call', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }
        
        // Handle notify_human tool call
        if (toolCall.function.name === 'notify_human') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('=== notify_human Tool Call ===');
            console.log('Reason:', args.reason);
            console.log('Conversation history:', args.conversation_history?.substring(0, 200));
            console.log('Order details:', args.order_details);
            console.log('Customer name:', args.customer_name);

            notifyHuman = {
              reason: args.reason || 'Transferência solicitada',
              conversationHistory: args.conversation_history || 'Sem histórico disponível',
              orderDetails: args.order_details,
              customerName: args.customer_name,
              customerPhone: phoneNumber,
            };

            // Log the tool call
            await createLog(
              agent.id,
              'tool_call',
              `Tool: notify_human - "${args.reason}"`,
              {
                reason: args.reason,
                conversationHistory: args.conversation_history?.substring(0, 500),
                orderDetails: args.order_details,
                customerName: args.customer_name,
                customerPhone: phoneNumber,
                notificationNumber: agent.notification_number,
              },
              phoneNumber,
              'whatsapp'
            );

            // Set a friendly message for the customer
            if (!toolSuggestedMessage) {
              toolSuggestedMessage = 'Entendido! Estou acionando um atendente humano para te ajudar. Em breve você será atendido. 🙌';
            }
          } catch (e) {
            console.error('Error parsing notify_human tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar notify_human', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle collect_customer_info tool call
        if (toolCall.function.name === 'collect_customer_info') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('=== collect_customer_info Tool Call ===');
            console.log('Field:', args.field_key, '=', args.field_value);

            // Save the collected data
            if (args.field_key && args.field_value) {
              await saveContactCollectedData(phoneNumber, { [args.field_key]: args.field_value });
              
              await createLog(
                agent.id,
                'tool_call',
                `Tool: collect_customer_info - ${args.field_key}`,
                {
                  fieldKey: args.field_key,
                  fieldValue: args.field_value,
                },
                phoneNumber,
                'whatsapp'
              );
            }
          } catch (e) {
            console.error('Error parsing collect_customer_info tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar collect_customer_info', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calculate_order tool call
        if (toolCall.function.name === 'calculate_order') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            console.log('=== calculate_order Tool Call ===');
            console.log('Items:', JSON.stringify(args.items));

            const orderItems: { name: string; quantity: number }[] = args.items || [];
            let orderTotal = 0;
            const orderDetails: string[] = [];
            const notFoundItems: string[] = [];

            for (const item of orderItems) {
              const product = productItems.find(
                p => p.name.toLowerCase() === item.name.toLowerCase() ||
                     p.name.toLowerCase().includes(item.name.toLowerCase()) ||
                     item.name.toLowerCase().includes(p.name.toLowerCase())
              );
              
              if (product) {
                const unitPrice = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
                const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity));
                const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
                const safeQty = Number.isFinite(qty) ? qty : 0;

                const subtotal = safeUnitPrice * safeQty;
                orderTotal += subtotal;
                orderDetails.push(`${safeQty}x ${product.name} = R$ ${subtotal.toFixed(2)}`);
                console.log(`✓ Product found: ${product.name} x ${safeQty} = R$ ${subtotal.toFixed(2)}`);
              } else {
                notFoundItems.push(item.name);
                console.log(`✗ Product not found: ${item.name}`);
              }
            }


            // Build order summary message
            let orderSummary = '📋 *Resumo do Pedido*\n\n';
            orderSummary += orderDetails.join('\n');
            orderSummary += `\n\n💰 *Total: R$ ${orderTotal.toFixed(2)}*`;
            
            if (notFoundItems.length > 0) {
              orderSummary += `\n\n⚠️ Produtos não encontrados: ${notFoundItems.join(', ')}`;
            }

            toolSuggestedMessage = orderSummary;

            await createLog(
              agent.id,
              'tool_call',
              `Tool: calculate_order - Total R$ ${orderTotal.toFixed(2)}`,
              {
                items: orderItems,
                orderDetails,
                total: orderTotal,
                notFoundItems,
              },
              phoneNumber,
              'whatsapp'
            );
          } catch (e) {
            console.error('Error parsing calculate_order tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calculate_order', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }
      }

      // Handle response based on tool calls
      if (notifyHuman) {
        console.log('=== Human notification requested ===');
        // Only set a single message for the customer - don't use AI text to avoid duplicates
        textResponse = 'Entendido! Estou acionando um atendente humano para te ajudar. Em breve você será atendido. 🙌';
        // Clear any media to avoid sending extra content during transfer
        mediaToSend = [];
      } else if (mediaToSend.length > 0) {
        console.log(`=== Sending ${mediaToSend.length} media items ===`);
        textResponse = toolSuggestedMessage || 'Perfeito — vou te enviar agora.';
        
        // Log media send
        await createLog(
          agent.id,
          'media_send',
          `Enviando ${mediaToSend.length} mídia(s)`,
          {
            mediaNames: mediaToSend.map(m => m.name),
            mediaTypes: mediaToSend.map(m => m.type),
          },
          phoneNumber,
          'whatsapp'
        );
      } else if (toolSuggestedMessage) {
        // Tool was called but no media matched
        console.log('=== Tool called but no media matched ===');
        textResponse = toolSuggestedMessage;
      }
    } else {
      console.log('=== No tool calls - Regular text response ===');
    }

    if (!textResponse && mediaToSend.length === 0 && !notifyHuman) {
      textResponse = 'Desculpe, não consegui gerar uma resposta.';
    }

    return { text: textResponse, mediaToSend, notifyHuman };
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

    // Get media context
    const { context: mediaContext, items: mediaItems } = await getMediaContext(agent.id);

    // Get products context (catalog)
    const { context: productsContext, items: productItems } = await getProductsContext(agent.id);

    // Add date/time context to test responses too
    const dateTimeContext = getDateTimeContext();
    let systemPrompt = agent.prompt + dateTimeContext;

    if (docsContext) {
      systemPrompt += `\n\nContexto adicional dos documentos:\n${docsContext}`;
    }

    if (mediaContext) {
      systemPrompt += mediaContext;
    }

    if (productsContext) {
      systemPrompt += productsContext;
    }

    // Build conversation history summary for notify_human
    const historyForSummary = history
      .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Agente'}: ${msg.content}`)
      .join('\n');

    // Add notify_human context if notification number is configured
    if (agent.notification_number) {
      // Build custom instructions section
      const customInstructions = agent.transfer_instructions
        ? `\n\n### Instruções Personalizadas do Negócio:\n${agent.transfer_instructions}\n`
        : '';

      systemPrompt += `\n\n## Transferência para Atendente Humano:
Você tem a capacidade de notificar um atendente humano via WhatsApp quando necessário.
Use a função "notify_human" quando:
- O cliente pedir explicitamente para falar com um humano
- O cliente confirmar um pedido/compra
- Você não conseguir resolver o problema do cliente
- A situação for complexa e requer análise humana
- O cliente estiver insatisfeito ou frustrado
${customInstructions}
IMPORTANTE: Ao usar notify_human, forneça:
- reason: Motivo claro (ex: "Confirmação de pedido", "Transferência solicitada", etc.)
- conversation_history: Histórico COMPLETO da conversa. Copie TODAS as mensagens abaixo:

---INÍCIO DO HISTÓRICO---
${historyForSummary}
---FIM DO HISTÓRICO---

Inclua também a mensagem atual do cliente no conversation_history.

- order_details: ${agent.transfer_instructions ? 'SIGA AS INSTRUÇÕES PERSONALIZADAS ACIMA para preencher este campo com as informações relevantes.' : 'Se for um pedido, liste TODOS os detalhes: produtos, quantidades, valores, endereço de entrega, forma de pagamento, observações, etc.'}
- customer_name: Nome do cliente se mencionado na conversa`;
    }

    const client = await getAgentOpenAIClient(agent);
    const model = agent.openai_model || process.env.OPENAI_MODEL || 'gpt-4o';

    // Build tools array based on agent configuration
    const availableTools: any[] = [];
    if (mediaItems.length > 0) {
      availableTools.push(...mediaTools);
    }
    if (productItems.length > 0) {
      availableTools.push(calculateOrderTool);
    }
    if (agent.notification_number) {
      availableTools.push(notifyHumanTool);
    }

    let response: any;
    try {
      response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(msg => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: userMessage },
        ],
        tools: availableTools.length > 0 ? availableTools : undefined,
        tool_choice: availableTools.length > 0 ? 'auto' : undefined,
      });
    } catch (err) {
      // Fallback without tools if it fails
      console.error('OpenAI test create failed (retrying without tools):', err);
      response = await client.chat.completions.create({
        model,
        max_completion_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(msg => ({ role: msg.role, content: msg.content })),
          { role: 'user', content: userMessage },
        ],
      });
    }

    const message = response.choices[0]?.message;
    let textResponse = message?.content || '';

    // Check for tool calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === 'send_media') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const mediaNames: string[] = args.media_names || [];
            const additionalMessage: string = args.message || '';

            // Find matching media items
            const matchedMedia: string[] = [];
            for (const name of mediaNames) {
              const found = mediaItems.find(
                m =>
                  m.name.toLowerCase().includes(String(name).toLowerCase()) ||
                  String(name).toLowerCase().includes(m.name.toLowerCase())
              );
              if (found) {
                matchedMedia.push(found.name);
              }
            }

            if (matchedMedia.length > 0) {
              textResponse = additionalMessage || `[Enviando mídia: ${matchedMedia.join(', ')}]`;
            } else {
              textResponse = additionalMessage || 'Desculpe, não encontrei a mídia solicitada.';
            }
          } catch (e) {
            console.error('Error parsing send_media tool call:', e);
          }
        }

        if (toolCall.function.name === 'calculate_order') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const orderItems: { name: string; quantity: number }[] = args.items || [];
            let orderTotal = 0;
            const orderDetails: string[] = [];
            const notFoundItems: string[] = [];

            for (const item of orderItems) {
              const product = productItems.find(
                p =>
                  p.name.toLowerCase() === String(item.name).toLowerCase() ||
                  p.name.toLowerCase().includes(String(item.name).toLowerCase()) ||
                  String(item.name).toLowerCase().includes(p.name.toLowerCase())
              );

              if (product) {
                const unitPrice = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
                const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity));
                const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
                const safeQty = Number.isFinite(qty) ? qty : 0;

                const subtotal = safeUnitPrice * safeQty;
                orderTotal += subtotal;
                orderDetails.push(`${safeQty}x ${product.name} = R$ ${subtotal.toFixed(2)}`);
              } else {
                notFoundItems.push(String(item.name));
              }
            }

            let orderSummary = '📋 Resumo do Pedido\n\n';
            orderSummary += orderDetails.join('\n');
            orderSummary += `\n\n💰 Total: R$ ${orderTotal.toFixed(2)}`;
            if (notFoundItems.length > 0) {
              orderSummary += `\n\n⚠️ Produtos não encontrados: ${notFoundItems.join(', ')}`;
            }

            textResponse = orderSummary;
          } catch (e) {
            console.error('Error parsing calculate_order tool call (test):', e);
          }
        }

        if (toolCall.function.name === 'notify_human') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            let responseText = `🔔 **Transferência para Humano Solicitada**\n\n**Motivo:** ${args.reason}`;

            if (args.order_details) {
              responseText += `\n\n🛒 **Detalhes do Pedido:**\n${args.order_details}`;
            }

            responseText += `\n\n💬 **Histórico:**\n${args.conversation_history?.substring(0, 500) || 'Sem histórico'}`;

            if (args.customer_name) {
              responseText += `\n\n**Nome do cliente:** ${args.customer_name}`;
            }

            textResponse = responseText;
          } catch (e) {
            console.error('Error parsing notify_human tool call:', e);
            textResponse = '🔔 Transferência para atendente humano solicitada.';
          }
        }
      }
    }

    return textResponse || 'Desculpe, não consegui gerar uma resposta.';
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

    // Add date/time context to widget responses
    const dateTimeContext = getDateTimeContext();
    const basePrompt = agent.prompt + dateTimeContext;

    const systemPrompt = docsContext 
      ? `${basePrompt}\n\nContexto adicional dos documentos:\n${docsContext}`
      : basePrompt;

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

// Text-to-Speech using OpenAI TTS
export async function textToSpeech(
  agent: AgentWithConfig, 
  text: string
): Promise<Buffer> {
  try {
    const client = await getAgentOpenAIClient(agent);
    
    // Use agent-specific voice or default to 'nova' (female)
    // Available voices: alloy, echo, fable, onyx, nova, shimmer
    // Male voices: echo, onyx, fable
    // Female voices: alloy, nova, shimmer
    const voice = agent.audio_response_voice || 'nova';
    
    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
      response_format: 'mp3',
    });
    
    // Convert the response to a buffer
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('TTS error:', error);
    throw error;
  }
}

// Preview voice for TTS settings
export async function previewVoice(
  voice: string,
  agent?: { openai_api_key?: string } | null
): Promise<Buffer> {
  try {
    const client = agent?.openai_api_key 
      ? new (await import('openai')).default({ apiKey: agent.openai_api_key })
      : await getGlobalOpenAIClient();
    
    const sampleTexts: Record<string, string> = {
      nova: 'Olá! Eu sou a Nova, uma voz feminina suave e natural.',
      shimmer: 'Oi! Meu nome é Shimmer, tenho uma voz feminina expressiva.',
      alloy: 'Olá! Eu sou Alloy, uma voz neutra e versátil.',
      onyx: 'Olá! Eu sou o Onyx, uma voz masculina grave e profunda.',
      echo: 'Oi! Meu nome é Echo, tenho uma voz masculina clara.',
      fable: 'Olá! Eu sou Fable, perfeita para narração de histórias.',
    };
    
    const text = sampleTexts[voice] || `Esta é uma demonstração da voz ${voice}.`;
    
    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: text,
      response_format: 'mp3',
    });
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Voice preview error:', error);
    throw error;
  }
}
