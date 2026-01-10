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
