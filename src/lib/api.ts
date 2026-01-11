// Backend API configuration
const RAW_API_BASE_URL = import.meta.env.VITE_API_URL || 'https://whats-agente-backend.isyhhh.easypanel.host';

const normalizeApiBaseUrl = (url: string) => {
  let base = url.trim().replace(/\/+$/, '');

  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Avoid Mixed Content: upgrade to https when the app is running on https
  if (isHttpsPage && base.startsWith('http://')) {
    base = `https://${base.slice('http://'.length)}`;
  }

  // If we ended up with https, drop :3000 (usually not exposed via TLS behind proxies)
  if (base.startsWith('https://')) {
    base = base.replace(/:3000$/, '');
  }

  return base;
};

export const API_BASE_URL = normalizeApiBaseUrl(RAW_API_BASE_URL);
async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP error ${response.status}`);
  }

  return response.json();
}

// Health check
export const checkHealth = () => apiRequest<{ status: string; timestamp: string }>('/health');

// Agents
export const getAgents = () => apiRequest<any[]>('/api/agents');

export const getAgent = (id: string) => apiRequest<any>(`/api/agents/${id}`);

export const createAgent = (data: {
  name: string;
  description: string;
  prompt: string;
  instanceName: string;
  webhookUrl: string;
  token: string;
}) => apiRequest<any>('/api/agents', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const updateAgent = (id: string, data: Partial<{
  name: string;
  description: string;
  prompt: string;
  instanceName: string;
  webhookUrl: string;
  token: string;
  status: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  audioEnabled: boolean;
  imageEnabled: boolean;
  documentEnabled: boolean;
  widgetEnabled: boolean;
  ghostMode: boolean;
  takeoverTimeout: number;
  inactivityEnabled: boolean;
  inactivityTimeout: number;
  inactivityMessage: string;
  operatingHoursEnabled: boolean;
  operatingHoursStart: string;
  operatingHoursEnd: string;
  operatingHoursTimezone: string;
  outOfHoursMessage: string;
  openaiApiKey: string;
  openaiModel: string;
  widgetAvatarUrl: string;
  widgetPosition: string;
  widgetTitle: string;
  widgetPrimaryColor: string;
  widgetSecondaryColor: string;
  widgetBackgroundColor: string;
  widgetTextColor: string;
  widgetTrainingMode: boolean;
  widgetResetCode: string;
  audioResponseEnabled: boolean;
  audioResponseVoice: string;
  notificationNumber: string;
  transferInstructions: string;
  requiredFields: { key: string; question: string }[];
}>) => apiRequest<any>(`/api/agents/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const testAgentEvolution = (id: string, data: {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  instanceName: string;
}) => apiRequest<{ success: boolean; connected?: boolean; state?: string; message?: string; error?: string }>(
  `/api/agents/${id}/test-evolution`,
  {
    method: 'POST',
    body: JSON.stringify(data),
  }
);

export const deleteAgent = (id: string) => apiRequest<void>(`/api/agents/${id}`, {
  method: 'DELETE',
});

// Messages
export const getMessages = (agentId?: string) => {
  const url = agentId ? `/api/messages?agent_id=${agentId}` : '/api/messages';
  return apiRequest<any[]>(url);
};

export const sendManualMessage = (data: {
  agentId: string;
  phoneNumber: string;
  content: string;
}) => apiRequest<{ success: boolean; message: any }>('/api/messages/send', {
  method: 'POST',
  body: JSON.stringify(data),
});

// Settings
export const getSettings = () => apiRequest<Record<string, string>>('/api/settings');

export const updateSettings = (settings: Record<string, string>) => 
  apiRequest<void>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

export const testEvolutionConnection = (url: string, key: string) =>
  apiRequest<{ success: boolean }>('/api/settings/test-evolution', {
    method: 'POST',
    body: JSON.stringify({ url, key }),
  });

export const testOpenAIConnection = (key: string) =>
  apiRequest<{ success: boolean }>('/api/settings/test-openai', {
    method: 'POST',
    body: JSON.stringify({ key }),
  });

export const previewVoice = (voice: string, agentId?: string) =>
  apiRequest<{ success: boolean; audio: string; mimeType: string }>('/api/settings/preview-voice', {
    method: 'POST',
    body: JSON.stringify({ voice, agentId }),
  });

// FAQs
export const getFaqs = (agentId: string) => 
  apiRequest<any[]>(`/api/faq/${agentId}`);

export const getFaqStats = (agentId: string) =>
  apiRequest<{ topFaqs: any[]; usageOverTime: any[]; totalApiCallsSaved: number }>(`/api/faq/${agentId}/stats`);

export const createFaq = (agentId: string, data: { question: string; answer: string; keywords?: string[] }) =>
  apiRequest<any>(`/api/faq/${agentId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateFaq = (agentId: string, faqId: string, data: Partial<{ question: string; answer: string; keywords: string[]; is_active: boolean }>) =>
  apiRequest<any>(`/api/faq/${agentId}/${faqId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteFaq = (agentId: string, faqId: string) =>
  apiRequest<{ success: boolean }>(`/api/faq/${agentId}/${faqId}`, {
    method: 'DELETE',
  });

// Logs
export const getLogs = (agentId?: string, logType?: string, limit: number = 100) => {
  const params = new URLSearchParams();
  if (agentId) params.append('agent_id', agentId);
  if (logType) params.append('log_type', logType);
  params.append('limit', limit.toString());
  return apiRequest<any[]>(`/api/logs?${params.toString()}`);
};

export const getLogStats = (agentId?: string) => {
  const params = new URLSearchParams();
  if (agentId) params.append('agent_id', agentId);
  return apiRequest<{ total: number; byType: any[]; recent: any[] }>(`/api/logs/stats?${params.toString()}`);
};

// Conversations
export const deleteConversation = (agentId: string, phoneNumber: string) =>
  apiRequest<{ success: boolean; deletedCount: number }>(
    `/api/conversations/agent/${agentId}/phone/${encodeURIComponent(phoneNumber)}`,
    { method: 'DELETE' }
  );

// Products
export interface Product {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  price: number;
  category: string | null;
  sku: string | null;
  stock: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


export const getProducts = (agentId: string) =>
  apiRequest<Product[]>(`/api/products/${agentId}`);

export const createProduct = (agentId: string, data: {
  name: string;
  description?: string;
  price: number;
  category?: string;
  sku?: string;
  stock?: number;
  image_url?: string;
  is_active?: boolean;
}) => apiRequest<Product>(`/api/products/${agentId}`, {
  method: 'POST',
  body: JSON.stringify(data),
});


export const updateProduct = (agentId: string, productId: string, data: Partial<{
  name: string;
  description: string;
  price: number;
  category: string;
  sku: string;
  stock: number;
  image_url: string;
  is_active: boolean;
}>) => apiRequest<Product>(`/api/products/${agentId}/${productId}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});


export const deleteProduct = (agentId: string, productId: string) =>
  apiRequest<{ success: boolean }>(`/api/products/${agentId}/${productId}`, {
    method: 'DELETE',
  });

export const bulkImportProducts = (agentId: string, products: Array<{
  name: string;
  description?: string;
  price: number;
  category?: string;
  sku?: string;
  stock?: number;
}>) => apiRequest<{ success: boolean; count: number; products: Product[] }>(
  `/api/products/${agentId}/bulk`,
  {
    method: 'POST',
    body: JSON.stringify({ products }),
  }
);

// Calendar
export interface CalendarStatus {
  connected: boolean;
  email?: string;
  expiresAt?: string;
  updatedAt?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink?: string;
}

export const getCalendarAuthUrl = (agentId: string) =>
  apiRequest<{ authUrl: string }>(`/api/calendar/auth-url/${agentId}`);

export const getCalendarStatus = (agentId: string) =>
  apiRequest<CalendarStatus>(`/api/calendar/status/${agentId}`);

export const disconnectCalendar = (agentId: string) =>
  apiRequest<{ success: boolean }>(`/api/calendar/disconnect/${agentId}`, {
    method: 'DELETE',
  });

export const getCalendarEvents = (agentId: string, options?: { timeMin?: string; timeMax?: string; maxResults?: number }) => {
  const params = new URLSearchParams();
  if (options?.timeMin) params.append('timeMin', options.timeMin);
  if (options?.timeMax) params.append('timeMax', options.timeMax);
  if (options?.maxResults) params.append('maxResults', options.maxResults.toString());
  return apiRequest<CalendarEvent[]>(`/api/calendar/events/${agentId}?${params.toString()}`);
};

export const createCalendarEvent = (agentId: string, data: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: string[];
}) => apiRequest<CalendarEvent>(`/api/calendar/events/${agentId}`, {
  method: 'POST',
  body: JSON.stringify(data),
});

export const updateCalendarEvent = (agentId: string, eventId: string, data: Partial<{
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}>) => apiRequest<CalendarEvent>(`/api/calendar/events/${agentId}/${eventId}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const deleteCalendarEvent = (agentId: string, eventId: string) =>
  apiRequest<{ success: boolean }>(`/api/calendar/events/${agentId}/${eventId}`, {
    method: 'DELETE',
  });
