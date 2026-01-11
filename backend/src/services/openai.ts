import OpenAI from 'openai';
import { query } from './database.js';
import { createLog } from '../routes/logs.js';
import { 
  isCalendarEnabled, 
  listCalendarEvents, 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent,
  checkCalendarAvailability 
} from './calendar.js';

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
  calendar_enabled?: boolean;
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

// Cart item interface
interface CartItem {
  productName: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

// Get cart from contact
async function getContactCart(phoneNumber: string): Promise<CartItem[]> {
  try {
    const result = await query(
      `SELECT collected_data FROM contacts WHERE phone_number = $1`,
      [phoneNumber]
    );
    if (result.rows.length > 0 && result.rows[0].collected_data) {
      const data = result.rows[0].collected_data;
      if (data._cart && Array.isArray(data._cart)) {
        return data._cart;
      }
    }
  } catch (error) {
    console.error('Error fetching contact cart:', error);
  }
  return [];
}

// Save cart to contact
async function saveContactCart(phoneNumber: string, cart: CartItem[]): Promise<void> {
  try {
    await query(
      `INSERT INTO contacts (phone_number, collected_data) 
       VALUES ($1, $2)
       ON CONFLICT (phone_number) 
       DO UPDATE SET 
         collected_data = COALESCE(contacts.collected_data, '{}'::jsonb) || $2,
         updated_at = CURRENT_TIMESTAMP`,
      [phoneNumber, JSON.stringify({ _cart: cart })]
    );
  } catch (error) {
    console.error('Error saving contact cart:', error);
  }
}

// Clear cart from contact
async function clearContactCart(phoneNumber: string): Promise<void> {
  try {
    await query(
      `UPDATE contacts 
       SET collected_data = collected_data - '_cart',
           updated_at = CURRENT_TIMESTAMP
       WHERE phone_number = $1`,
      [phoneNumber]
    );
  } catch (error) {
    console.error('Error clearing contact cart:', error);
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
  image_url: string | null;
  is_active: boolean;
}



// Get products context for agent prompt
async function getProductsContext(agentId: string): Promise<{ context: string; items: ProductItem[] }> {
  let items: ProductItem[] = [];

  try {
    const result = await query(
      `SELECT id, name, description, price, category, sku, stock, image_url, is_active 
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
      const imageInfo = p.image_url ? ' 📷' : '';
      const priceNumber = typeof p.price === 'number' ? p.price : parseFloat(String(p.price));
      const priceLabel = Number.isFinite(priceNumber) ? priceNumber.toFixed(2) : '0.00';
      productList += `- "${p.name}" - R$ ${priceLabel}${stockInfo}${imageInfo}\n`;
      if (p.description) productList += `  Descrição: ${p.description}\n`;
    }
  }

  
  const context = `\n\n## 📦 Catálogo de Produtos Disponíveis:\n${productList}

## 🛒 SISTEMA DE CARRINHO/PEDIDO:
Você possui um sistema de carrinho que armazena os produtos que o cliente vai pedindo durante a conversa.

### Ferramentas disponíveis:
1. **add_to_cart** - Adiciona um produto ao carrinho. Use quando o cliente pedir/quiser um produto.
2. **remove_from_cart** - Remove um produto do carrinho. Use quando o cliente desistir de um item.
3. **view_cart** - Mostra o carrinho atual com todos os itens e o total. Use para confirmar pedidos ou quando o cliente perguntar o que tem no carrinho.
4. **clear_cart** - Limpa todo o carrinho. Use quando o cliente quiser começar de novo ou após finalizar um pedido.
5. **confirm_order** - Confirma o pedido e gera um resumo final. Use quando o cliente confirmar que quer finalizar.

### Fluxo recomendado:
1. Quando o cliente mencionar produtos, use add_to_cart para cada item
2. Pergunte se deseja mais alguma coisa
3. Use view_cart para mostrar o resumo antes de confirmar
4. Quando o cliente confirmar, use confirm_order
5. Após a confirmação, o carrinho é limpo automaticamente para novos pedidos

### Exemplos de uso:
- Cliente: "quero 2 pizzas e 3 cervejas" → add_to_cart para cada produto
- Cliente: "tira a cerveja" → remove_from_cart
- Cliente: "quanto deu?" → view_cart
- Cliente: "isso mesmo, pode confirmar" → confirm_order

Produtos com 📷 possuem foto - use "send_product_image" para enviar a imagem.`;
  
  return { context, items };
}


// Tool for adding items to cart
const addToCartTool = {
  type: 'function' as const,
  function: {
    name: 'add_to_cart',
    description: 'Adiciona um produto ao carrinho do cliente. Use quando o cliente pedir/quiser um produto. O carrinho é mantido na memória durante toda a conversa.',
    parameters: {
      type: 'object',
      properties: {
        product_name: {
          type: 'string',
          description: 'Nome do produto conforme listado no catálogo'
        },
        quantity: {
          type: 'number',
          description: 'Quantidade do produto (padrão: 1)'
        }
      },
      required: ['product_name']
    }
  }
};

// Tool for removing items from cart
const removeFromCartTool = {
  type: 'function' as const,
  function: {
    name: 'remove_from_cart',
    description: 'Remove um produto do carrinho do cliente. Use quando o cliente desistir de um item ou quiser remover algo.',
    parameters: {
      type: 'object',
      properties: {
        product_name: {
          type: 'string',
          description: 'Nome do produto a remover'
        },
        quantity: {
          type: 'number',
          description: 'Quantidade a remover (se não informado, remove todo o item)'
        }
      },
      required: ['product_name']
    }
  }
};

// Tool for viewing cart
const viewCartTool = {
  type: 'function' as const,
  function: {
    name: 'view_cart',
    description: 'Mostra o carrinho atual do cliente com todos os itens, quantidades, valores individuais e total. Use para revisar o pedido antes de confirmar ou quando o cliente perguntar o que tem no carrinho.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

// Tool for clearing cart
const clearCartTool = {
  type: 'function' as const,
  function: {
    name: 'clear_cart',
    description: 'Limpa todo o carrinho do cliente. Use quando o cliente quiser começar de novo ou cancelar tudo.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

// Tool for confirming order
const confirmOrderTool = {
  type: 'function' as const,
  function: {
    name: 'confirm_order',
    description: 'Confirma o pedido atual e gera um resumo final. Após a confirmação, o carrinho é limpo automaticamente para novos pedidos. Use quando o cliente confirmar que quer finalizar o pedido.',
    parameters: {
      type: 'object',
      properties: {
        customer_notes: {
          type: 'string',
          description: 'Observações do cliente (endereço, forma de pagamento, horário, etc.)'
        }
      },
      required: []
    }
  }
};

// Legacy tool for calculating orders (kept for backward compatibility)
const calculateOrderTool = {
  type: 'function' as const,
  function: {
    name: 'calculate_order',
    description: 'LEGADO - Prefira usar add_to_cart + view_cart. Calcula o total de um pedido com base nos produtos e quantidades informados.',
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

// Tool for sending product images from catalog
const sendProductImageTool = {
  type: 'function' as const,
  function: {
    name: 'send_product_image',
    description: 'Envia a foto de um produto do catálogo para o usuário. Use quando o cliente perguntar sobre um produto específico que possui foto (marcado com 📷) ou pedir para ver a imagem do produto.',
    parameters: {
      type: 'object',
      properties: {
        product_name: {
          type: 'string',
          description: 'Nome do produto conforme listado no catálogo'
        },
        message: {
          type: 'string',
          description: 'Mensagem de texto para acompanhar a imagem (opcional)'
        }
      },
      required: ['product_name']
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

// Calendar Tools
const listEventsTool = {
  type: 'function' as const,
  function: {
    name: 'calendar_list_events',
    description: 'Lista os compromissos/eventos do calendário. Use para verificar agenda, disponibilidade ou mostrar eventos próximos.',
    parameters: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Quantos dias à frente buscar (padrão: 7)'
        },
        max_results: {
          type: 'number',
          description: 'Número máximo de eventos (padrão: 10)'
        }
      },
      required: []
    }
  }
};

const createEventTool = {
  type: 'function' as const,
  function: {
    name: 'calendar_create_event',
    description: 'Cria um novo compromisso/evento no calendário. Use quando o cliente quiser agendar algo.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Título do evento (ex: "Reunião com João", "Consulta médica")'
        },
        date: {
          type: 'string',
          description: 'Data do evento no formato YYYY-MM-DD (ex: "2025-01-15")'
        },
        start_time: {
          type: 'string',
          description: 'Horário de início no formato HH:MM (ex: "14:00")'
        },
        end_time: {
          type: 'string',
          description: 'Horário de término no formato HH:MM (ex: "15:00")'
        },
        description: {
          type: 'string',
          description: 'Descrição ou notas adicionais (opcional)'
        }
      },
      required: ['title', 'date', 'start_time', 'end_time']
    }
  }
};

const updateEventTool = {
  type: 'function' as const,
  function: {
    name: 'calendar_update_event',
    description: 'Atualiza/modifica um compromisso existente. Use quando o cliente quiser remarcar ou alterar detalhes de um evento.',
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'ID do evento a ser atualizado (obtido de calendar_list_events)'
        },
        title: {
          type: 'string',
          description: 'Novo título (opcional)'
        },
        date: {
          type: 'string',
          description: 'Nova data no formato YYYY-MM-DD (opcional)'
        },
        start_time: {
          type: 'string',
          description: 'Novo horário de início HH:MM (opcional)'
        },
        end_time: {
          type: 'string',
          description: 'Novo horário de término HH:MM (opcional)'
        },
        description: {
          type: 'string',
          description: 'Nova descrição (opcional)'
        }
      },
      required: ['event_id']
    }
  }
};

const deleteEventTool = {
  type: 'function' as const,
  function: {
    name: 'calendar_delete_event',
    description: 'Exclui/cancela um compromisso do calendário. Use quando o cliente quiser cancelar um evento.',
    parameters: {
      type: 'object',
      properties: {
        event_id: {
          type: 'string',
          description: 'ID do evento a ser excluído (obtido de calendar_list_events)'
        }
      },
      required: ['event_id']
    }
  }
};

const checkAvailabilityTool = {
  type: 'function' as const,
  function: {
    name: 'calendar_check_availability',
    description: 'Verifica os horários ocupados em um dia específico. Use para encontrar horários livres antes de agendar.',
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Data para verificar no formato YYYY-MM-DD (ex: "2025-01-15")'
        }
      },
      required: ['date']
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
      // Add cart tools
      availableTools.push(addToCartTool);
      availableTools.push(removeFromCartTool);
      availableTools.push(viewCartTool);
      availableTools.push(clearCartTool);
      availableTools.push(confirmOrderTool);
      availableTools.push(calculateOrderTool); // Legacy, kept for backward compat
      // Add send_product_image tool if any product has an image
      const hasProductImages = productItems.some(p => p.image_url);
      if (hasProductImages) {
        availableTools.push(sendProductImageTool);
      }
    }
    if (agent.notification_number) {
      availableTools.push(notifyHumanTool);
      availableTools.push(collectInfoTool);
    }
    
    // Add calendar tools if enabled for this agent
    const calendarEnabled = await isCalendarEnabled(agent.id);
    if (calendarEnabled) {
      availableTools.push(listEventsTool);
      availableTools.push(createEventTool);
      availableTools.push(updateEventTool);
      availableTools.push(deleteEventTool);
      availableTools.push(checkAvailabilityTool);
      
      // Add calendar context to system prompt
      systemPrompt += `\n\n## 📅 Integração com Google Calendar:
Você tem acesso ao calendário do agente. Use as ferramentas de calendário para:

### Ferramentas disponíveis:
1. **calendar_list_events** - Lista os próximos compromissos. Use para mostrar a agenda ou verificar horários.
2. **calendar_create_event** - Cria um novo evento/compromisso. Pergunte: título, data, horário início/fim.
3. **calendar_update_event** - Altera um evento existente (remarcar, mudar título, etc.).
4. **calendar_delete_event** - Cancela/exclui um evento.
5. **calendar_check_availability** - Verifica horários ocupados em um dia específico.

### Fluxo recomendado para agendamentos:
1. Pergunte qual serviço/tipo de compromisso
2. Use calendar_check_availability para ver horários ocupados
3. Sugira horários livres ao cliente
4. Após confirmação, use calendar_create_event
5. Confirme o agendamento ao cliente

### Formatos de data/hora:
- Data: YYYY-MM-DD (ex: 2025-01-15)
- Hora: HH:MM (ex: 14:30)`;
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

        // Handle send_product_image tool call
        if (toolCall.function.name === 'send_product_image') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const productName: string = args.product_name || '';
            const additionalMessage: string = args.message || '';

            console.log('=== send_product_image Tool Call ===');
            console.log('Product name:', productName);

            // Find matching product with image
            const product = productItems.find(
              p => p.name.toLowerCase() === productName.toLowerCase() ||
                   p.name.toLowerCase().includes(productName.toLowerCase()) ||
                   productName.toLowerCase().includes(p.name.toLowerCase())
            );

            if (product && product.image_url) {
              // Add to mediaToSend as a synthetic media item
              const productMedia: MediaItem = {
                id: product.id,
                name: product.name,
                description: product.description || '',
                type: 'image',
                file_urls: [product.image_url],
                mime_types: ['image/jpeg'], // assume jpeg for simplicity
              };
              mediaToSend.push(productMedia);

              const priceNumber = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
              const priceLabel = Number.isFinite(priceNumber) ? `R$ ${priceNumber.toFixed(2)}` : '';

              toolSuggestedMessage = additionalMessage || `Aqui está a foto do ${product.name}${priceLabel ? ` - ${priceLabel}` : ''}! 📷`;

              await createLog(
                agent.id,
                'tool_call',
                `Tool: send_product_image - ${product.name}`,
                {
                  productName: product.name,
                  imageUrl: product.image_url,
                },
                phoneNumber,
                'whatsapp'
              );
            } else if (product) {
              toolSuggestedMessage = `O produto ${product.name} não possui foto cadastrada no momento.`;
              console.log(`✗ Product found but no image: ${product.name}`);
            } else {
              toolSuggestedMessage = `Desculpe, não encontrei o produto "${productName}" no catálogo.`;
              console.log(`✗ Product not found: ${productName}`);
            }
          } catch (e) {
            console.error('Error parsing send_product_image tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar send_product_image', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle add_to_cart tool call
        if (toolCall.function.name === 'add_to_cart') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const productName: string = args.product_name || '';
            const quantity: number = args.quantity || 1;

            console.log('=== add_to_cart Tool Call ===');
            console.log('Product name:', productName, 'Quantity:', quantity);

            // Find matching product
            const product = productItems.find(
              p => p.name.toLowerCase() === productName.toLowerCase() ||
                   p.name.toLowerCase().includes(productName.toLowerCase()) ||
                   productName.toLowerCase().includes(p.name.toLowerCase())
            );

            if (product) {
              const unitPrice = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
              const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;

              // Get current cart
              const currentCart = await getContactCart(phoneNumber);
              
              // Check if product already in cart
              const existingIndex = currentCart.findIndex(item => item.productId === product.id);
              if (existingIndex >= 0) {
                currentCart[existingIndex].quantity += quantity;
              } else {
                currentCart.push({
                  productName: product.name,
                  productId: product.id,
                  quantity,
                  unitPrice: safeUnitPrice,
                });
              }

              // Save updated cart
              await saveContactCart(phoneNumber, currentCart);

              const totalItems = currentCart.reduce((sum, item) => sum + item.quantity, 0);
              const cartTotal = currentCart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

              toolSuggestedMessage = `✅ Adicionado: ${quantity}x ${product.name} (R$ ${safeUnitPrice.toFixed(2)} cada)\n\n🛒 Carrinho: ${totalItems} item(s) | Total: R$ ${cartTotal.toFixed(2)}\n\nDeseja mais alguma coisa?`;

              await createLog(
                agent.id,
                'tool_call',
                `Tool: add_to_cart - ${quantity}x ${product.name}`,
                { productName: product.name, quantity, cartTotal, totalItems },
                phoneNumber,
                'whatsapp'
              );
            } else {
              toolSuggestedMessage = `Desculpe, não encontrei "${productName}" no catálogo. Posso te ajudar com outro produto?`;
            }
          } catch (e) {
            console.error('Error parsing add_to_cart tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar add_to_cart', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle remove_from_cart tool call
        if (toolCall.function.name === 'remove_from_cart') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const productName: string = args.product_name || '';
            const quantity: number | undefined = args.quantity;

            console.log('=== remove_from_cart Tool Call ===');
            console.log('Product name:', productName, 'Quantity:', quantity);

            // Get current cart
            const currentCart = await getContactCart(phoneNumber);
            
            // Find item in cart
            const existingIndex = currentCart.findIndex(
              item => item.productName.toLowerCase().includes(productName.toLowerCase()) ||
                      productName.toLowerCase().includes(item.productName.toLowerCase())
            );

            if (existingIndex >= 0) {
              const item = currentCart[existingIndex];
              if (quantity && quantity < item.quantity) {
                currentCart[existingIndex].quantity -= quantity;
                toolSuggestedMessage = `✅ Removido: ${quantity}x ${item.productName}`;
              } else {
                currentCart.splice(existingIndex, 1);
                toolSuggestedMessage = `✅ ${item.productName} removido do carrinho`;
              }

              // Save updated cart
              await saveContactCart(phoneNumber, currentCart);

              if (currentCart.length > 0) {
                const totalItems = currentCart.reduce((sum, i) => sum + i.quantity, 0);
                const cartTotal = currentCart.reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
                toolSuggestedMessage += `\n\n🛒 Carrinho: ${totalItems} item(s) | Total: R$ ${cartTotal.toFixed(2)}`;
              } else {
                toolSuggestedMessage += `\n\n🛒 Carrinho vazio`;
              }

              await createLog(
                agent.id,
                'tool_call',
                `Tool: remove_from_cart - ${productName}`,
                { productName, quantityRemoved: quantity || 'all' },
                phoneNumber,
                'whatsapp'
              );
            } else {
              toolSuggestedMessage = `Não encontrei "${productName}" no seu carrinho.`;
            }
          } catch (e) {
            console.error('Error parsing remove_from_cart tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar remove_from_cart', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle view_cart tool call
        if (toolCall.function.name === 'view_cart') {
          try {
            console.log('=== view_cart Tool Call ===');

            // Get current cart
            const currentCart = await getContactCart(phoneNumber);

            if (currentCart.length === 0) {
              toolSuggestedMessage = '🛒 Seu carrinho está vazio.\n\nQue tal adicionar alguns produtos?';
            } else {
              let cartSummary = '🛒 *Seu Carrinho*\n\n';
              let cartTotal = 0;

              for (const item of currentCart) {
                const subtotal = item.quantity * item.unitPrice;
                cartTotal += subtotal;
                cartSummary += `• ${item.quantity}x ${item.productName}\n  R$ ${item.unitPrice.toFixed(2)} cada = R$ ${subtotal.toFixed(2)}\n`;
              }

              cartSummary += `\n💰 *Total: R$ ${cartTotal.toFixed(2)}*`;
              cartSummary += `\n\nDeseja confirmar o pedido ou adicionar mais itens?`;

              toolSuggestedMessage = cartSummary;

              await createLog(
                agent.id,
                'tool_call',
                `Tool: view_cart - ${currentCart.length} itens, Total R$ ${cartTotal.toFixed(2)}`,
                { cartItems: currentCart, total: cartTotal },
                phoneNumber,
                'whatsapp'
              );
            }
          } catch (e) {
            console.error('Error parsing view_cart tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar view_cart', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle clear_cart tool call
        if (toolCall.function.name === 'clear_cart') {
          try {
            console.log('=== clear_cart Tool Call ===');

            await clearContactCart(phoneNumber);
            toolSuggestedMessage = '🗑️ Carrinho limpo!\n\nPodemos começar um novo pedido quando quiser.';

            await createLog(
              agent.id,
              'tool_call',
              'Tool: clear_cart',
              {},
              phoneNumber,
              'whatsapp'
            );
          } catch (e) {
            console.error('Error parsing clear_cart tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar clear_cart', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle confirm_order tool call
        if (toolCall.function.name === 'confirm_order') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const customerNotes: string = args.customer_notes || '';

            console.log('=== confirm_order Tool Call ===');
            console.log('Customer notes:', customerNotes);

            // Get current cart
            const currentCart = await getContactCart(phoneNumber);

            if (currentCart.length === 0) {
              toolSuggestedMessage = '⚠️ Seu carrinho está vazio. Adicione produtos antes de confirmar o pedido.';
            } else {
              let orderSummary = '✅ *PEDIDO CONFIRMADO!*\n\n';
              orderSummary += '📋 *Itens do Pedido:*\n';
              let orderTotal = 0;

              for (const item of currentCart) {
                const subtotal = item.quantity * item.unitPrice;
                orderTotal += subtotal;
                orderSummary += `• ${item.quantity}x ${item.productName} = R$ ${subtotal.toFixed(2)}\n`;
              }

              orderSummary += `\n💰 *TOTAL: R$ ${orderTotal.toFixed(2)}*`;
              
              if (customerNotes) {
                orderSummary += `\n\n📝 *Observações:* ${customerNotes}`;
              }

              orderSummary += `\n\n🎉 Obrigado pelo pedido! Em breve você receberá mais informações.`;

              toolSuggestedMessage = orderSummary;

              // Clear cart after confirmation
              await clearContactCart(phoneNumber);

              await createLog(
                agent.id,
                'tool_call',
                `Tool: confirm_order - Total R$ ${orderTotal.toFixed(2)}`,
                { cartItems: currentCart, total: orderTotal, notes: customerNotes },
                phoneNumber,
                'whatsapp'
              );
            }
          } catch (e) {
            console.error('Error parsing confirm_order tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar confirm_order', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calendar_list_events tool call
        if (toolCall.function.name === 'calendar_list_events') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const daysAhead = args.days_ahead || 7;
            const maxResults = args.max_results || 10;

            console.log('=== calendar_list_events Tool Call ===');

            const timeMin = new Date().toISOString();
            const timeMax = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
            
            const result = await listCalendarEvents(agent.id, timeMin, timeMax, maxResults);

            if (result.success && result.events) {
              if (result.events.length === 0) {
                toolSuggestedMessage = `📅 Não há compromissos agendados nos próximos ${daysAhead} dias.`;
              } else {
                let eventsList = `📅 *Próximos compromissos:*\n\n`;
                for (const event of result.events) {
                  const start = event.start?.dateTime || event.start?.date;
                  const startDate = start ? new Date(start) : null;
                  const dateStr = startDate ? startDate.toLocaleDateString('pt-BR', { 
                    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                  }) : 'Data não definida';
                  eventsList += `• *${event.summary}*\n  📆 ${dateStr}\n  🔑 ID: ${event.id}\n\n`;
                }
                toolSuggestedMessage = eventsList;
              }

              await createLog(agent.id, 'tool_call', `Tool: calendar_list_events - ${result.events.length} eventos`, 
                { eventsCount: result.events.length, daysAhead }, phoneNumber, 'whatsapp');
            } else {
              toolSuggestedMessage = `❌ ${result.error || 'Erro ao buscar eventos do calendário.'}`;
            }
          } catch (e) {
            console.error('Error parsing calendar_list_events tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calendar_list_events', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calendar_create_event tool call
        if (toolCall.function.name === 'calendar_create_event') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const title = args.title;
            const date = args.date;
            const startTime = args.start_time;
            const endTime = args.end_time;
            const description = args.description;

            console.log('=== calendar_create_event Tool Call ===');

            const startDateTime = `${date}T${startTime}:00-03:00`;
            const endDateTime = `${date}T${endTime}:00-03:00`;

            const result = await createCalendarEvent(agent.id, title, startDateTime, endDateTime, description);

            if (result.success && result.event) {
              const startDate = new Date(startDateTime);
              const dateStr = startDate.toLocaleDateString('pt-BR', { 
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' 
              });
              toolSuggestedMessage = `✅ *Compromisso agendado com sucesso!*\n\n📌 *${title}*\n📆 ${dateStr}\n⏰ ${startTime} às ${endTime}${description ? `\n📝 ${description}` : ''}\n\n🔑 ID: ${result.event.id}`;

              await createLog(agent.id, 'tool_call', `Tool: calendar_create_event - ${title}`, 
                { title, date, startTime, endTime, eventId: result.event.id }, phoneNumber, 'whatsapp');
            } else {
              toolSuggestedMessage = `❌ ${result.error || 'Erro ao criar evento no calendário.'}`;
            }
          } catch (e) {
            console.error('Error parsing calendar_create_event tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calendar_create_event', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calendar_update_event tool call
        if (toolCall.function.name === 'calendar_update_event') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const eventId = args.event_id;
            const updates: any = {};
            
            if (args.title) updates.summary = args.title;
            if (args.description) updates.description = args.description;
            if (args.date && args.start_time) updates.startDateTime = `${args.date}T${args.start_time}:00-03:00`;
            if (args.date && args.end_time) updates.endDateTime = `${args.date}T${args.end_time}:00-03:00`;

            console.log('=== calendar_update_event Tool Call ===');

            const result = await updateCalendarEvent(agent.id, eventId, updates);

            if (result.success) {
              toolSuggestedMessage = `✅ *Compromisso atualizado com sucesso!*\n\n📌 ${result.event?.summary || 'Evento'}`;

              await createLog(agent.id, 'tool_call', `Tool: calendar_update_event - ${eventId}`, 
                { eventId, updates }, phoneNumber, 'whatsapp');
            } else {
              toolSuggestedMessage = `❌ ${result.error || 'Erro ao atualizar evento.'}`;
            }
          } catch (e) {
            console.error('Error parsing calendar_update_event tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calendar_update_event', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calendar_delete_event tool call
        if (toolCall.function.name === 'calendar_delete_event') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const eventId = args.event_id;

            console.log('=== calendar_delete_event Tool Call ===');

            const result = await deleteCalendarEvent(agent.id, eventId);

            if (result.success) {
              toolSuggestedMessage = `✅ *Compromisso cancelado/excluído com sucesso!*`;

              await createLog(agent.id, 'tool_call', `Tool: calendar_delete_event - ${eventId}`, 
                { eventId }, phoneNumber, 'whatsapp');
            } else {
              toolSuggestedMessage = `❌ ${result.error || 'Erro ao excluir evento.'}`;
            }
          } catch (e) {
            console.error('Error parsing calendar_delete_event tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calendar_delete_event', { error: String(e) }, phoneNumber, 'whatsapp');
          }
        }

        // Handle calendar_check_availability tool call
        if (toolCall.function.name === 'calendar_check_availability') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const date = args.date;

            console.log('=== calendar_check_availability Tool Call ===');

            const result = await checkCalendarAvailability(agent.id, date);

            if (result.success) {
              const dateObj = new Date(date + 'T12:00:00');
              const dateStr = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

              if (!result.busySlots || result.busySlots.length === 0) {
                toolSuggestedMessage = `📅 *${dateStr}*\n\n✅ Dia totalmente livre! Qual horário você prefere?`;
              } else {
                let busyList = `📅 *${dateStr}*\n\n⚠️ *Horários ocupados:*\n`;
                for (const slot of result.busySlots) {
                  const startTime = slot.start ? new Date(slot.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  const endTime = slot.end ? new Date(slot.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
                  busyList += `• ${startTime} - ${endTime}\n`;
                }
                busyList += `\nOs demais horários estão disponíveis. Qual você prefere?`;
                toolSuggestedMessage = busyList;
              }

              await createLog(agent.id, 'tool_call', `Tool: calendar_check_availability - ${date}`, 
                { date, busySlotsCount: result.busySlots?.length || 0 }, phoneNumber, 'whatsapp');
            } else {
              toolSuggestedMessage = `❌ ${result.error || 'Erro ao verificar disponibilidade.'}`;
            }
          } catch (e) {
            console.error('Error parsing calendar_check_availability tool call:', e);
            await createLog(agent.id, 'error', 'Erro ao processar calendar_check_availability', { error: String(e) }, phoneNumber, 'whatsapp');
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
      // Add cart tools
      availableTools.push(addToCartTool);
      availableTools.push(removeFromCartTool);
      availableTools.push(viewCartTool);
      availableTools.push(clearCartTool);
      availableTools.push(confirmOrderTool);
      availableTools.push(calculateOrderTool);
      // Add send_product_image tool if any product has an image
      const hasProductImages = productItems.some(p => p.image_url);
      if (hasProductImages) {
        availableTools.push(sendProductImageTool);
      }
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

        if (toolCall.function.name === 'send_product_image') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const productName: string = args.product_name || '';
            const additionalMessage: string = args.message || '';

            const product = productItems.find(
              p =>
                p.name.toLowerCase() === productName.toLowerCase() ||
                p.name.toLowerCase().includes(productName.toLowerCase()) ||
                productName.toLowerCase().includes(p.name.toLowerCase())
            );

            if (product && product.image_url) {
              const priceNumber = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
              const priceLabel = Number.isFinite(priceNumber) ? `R$ ${priceNumber.toFixed(2)}` : '';
              textResponse = additionalMessage || `[Enviando foto: ${product.name}${priceLabel ? ` - ${priceLabel}` : ''}] 📷`;
            } else if (product) {
              textResponse = `O produto ${product.name} não possui foto cadastrada.`;
            } else {
              textResponse = `Produto "${productName}" não encontrado no catálogo.`;
            }
          } catch (e) {
            console.error('Error parsing send_product_image tool call (test):', e);
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

        // Cart tools for testing (simplified - no persistence in test mode)
        if (toolCall.function.name === 'add_to_cart') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            const productName: string = args.product_name || '';
            const quantity: number = args.quantity || 1;

            const product = productItems.find(
              p => p.name.toLowerCase().includes(productName.toLowerCase()) ||
                   productName.toLowerCase().includes(p.name.toLowerCase())
            );

            if (product) {
              const unitPrice = typeof product.price === 'number' ? product.price : parseFloat(String(product.price));
              const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
              textResponse = `✅ Adicionado: ${quantity}x ${product.name} (R$ ${safeUnitPrice.toFixed(2)} cada)\n\n🛒 [Carrinho atualizado no modo teste]\n\nDeseja mais alguma coisa?`;
            } else {
              textResponse = `Desculpe, não encontrei "${productName}" no catálogo.`;
            }
          } catch (e) {
            console.error('Error parsing add_to_cart tool call (test):', e);
          }
        }

        if (toolCall.function.name === 'remove_from_cart') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            textResponse = `✅ ${args.product_name} removido do carrinho\n\n🛒 [Carrinho atualizado no modo teste]`;
          } catch (e) {
            console.error('Error parsing remove_from_cart tool call (test):', e);
          }
        }

        if (toolCall.function.name === 'view_cart') {
          textResponse = '🛒 [Visualização do carrinho no modo teste - o carrinho real funciona apenas no WhatsApp]';
        }

        if (toolCall.function.name === 'clear_cart') {
          textResponse = '🗑️ Carrinho limpo!\n\nPodemos começar um novo pedido quando quiser.';
        }

        if (toolCall.function.name === 'confirm_order') {
          try {
            const args = JSON.parse(toolCall.function.arguments);
            let orderText = '✅ *PEDIDO CONFIRMADO!*\n\n';
            orderText += '[No modo teste, o pedido seria finalizado e o carrinho limpo]\n';
            if (args.customer_notes) {
              orderText += `\n📝 *Observações:* ${args.customer_notes}`;
            }
            orderText += '\n\n🎉 Obrigado pelo pedido!';
            textResponse = orderText;
          } catch (e) {
            console.error('Error parsing confirm_order tool call (test):', e);
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
