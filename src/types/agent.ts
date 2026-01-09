export interface Agent {
  id: string;
  name: string;
  description: string;
  prompt: string;
  status: 'online' | 'offline' | 'error';
  instanceName: string;
  webhookUrl: string;
  token: string;
  messagesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  agentId: string;
  sender: 'user' | 'agent';
  content: string;
  phoneNumber: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'error';
}

export interface Settings {
  openaiApiKey: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  defaultModel: string;
}

export interface WebhookPayload {
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message: {
      conversation?: string;
      extendedTextMessage?: {
        text: string;
      };
    };
    messageTimestamp: number;
  };
}
