// Backend API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://whats-agente-backend.isyhhh.easypanel.host:3000';

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
}>) => apiRequest<any>(`/api/agents/${id}`, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const deleteAgent = (id: string) => apiRequest<void>(`/api/agents/${id}`, {
  method: 'DELETE',
});

// Messages
export const getMessages = (agentId?: string) => {
  const url = agentId ? `/api/messages?agent_id=${agentId}` : '/api/messages';
  return apiRequest<any[]>(url);
};

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
