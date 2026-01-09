import { useState } from 'react';
import { motion } from 'framer-motion';
import { Webhook, Copy, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface WebhookConfig {
  id: string;
  instanceName: string;
  webhookUrl: string;
  token: string;
  status: 'active' | 'inactive' | 'error';
  lastPing: Date | null;
  eventsReceived: number;
}

const mockWebhooks: WebhookConfig[] = [
  {
    id: '1',
    instanceName: 'atendimento-principal',
    webhookUrl: 'https://seu-dominio.com/api/webhook/atendimento',
    token: 'whk_abc123xyz789',
    status: 'active',
    lastPing: new Date(Date.now() - 1000 * 60 * 2),
    eventsReceived: 1247,
  },
  {
    id: '2',
    instanceName: 'suporte-tech',
    webhookUrl: 'https://seu-dominio.com/api/webhook/suporte',
    token: 'whk_def456uvw012',
    status: 'active',
    lastPing: new Date(Date.now() - 1000 * 60 * 5),
    eventsReceived: 892,
  },
  {
    id: '3',
    instanceName: 'vendas-bot',
    webhookUrl: 'https://seu-dominio.com/api/webhook/vendas',
    token: 'whk_ghi789rst345',
    status: 'inactive',
    lastPing: null,
    eventsReceived: 0,
  },
];

const WebhooksPage = () => {
  const [webhooks] = useState(mockWebhooks);
  const { toast } = useToast();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Nunca';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    return `há ${Math.floor(minutes / 60)}h`;
  };

  return (
    <MainLayout>
      <Header 
        title="Webhooks" 
        subtitle="Configure os endpoints para receber mensagens da Evolution API"
      />

      <div className="space-y-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <h3 className="font-semibold text-foreground mb-4">Como configurar</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>1. Copie a URL do webhook da instância desejada</p>
            <p>2. No painel da Evolution API, vá em Configurações → Webhook</p>
            <p>3. Cole a URL e adicione o token no header de autenticação</p>
            <p>4. Ative os eventos: <code className="bg-muted px-2 py-1 rounded">messages.upsert</code></p>
          </div>
        </motion.div>
      </div>

      <div className="space-y-4">
        {webhooks.map((webhook, index) => (
          <motion.div
            key={webhook.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Webhook className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{webhook.instanceName}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {webhook.status === 'active' ? (
                      <Badge className="bg-success/20 text-success border-0">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Ativo
                      </Badge>
                    ) : webhook.status === 'error' ? (
                      <Badge className="bg-destructive/20 text-destructive border-0">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Erro
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Último ping: {formatTime(webhook.lastPing)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {webhook.eventsReceived.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">eventos recebidos</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-20">URL:</span>
                <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm text-foreground font-mono truncate">
                  {webhook.webhookUrl}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => copyToClipboard(webhook.webhookUrl, 'URL')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-20">Token:</span>
                <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm text-foreground font-mono truncate">
                  {webhook.token}
                </code>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => copyToClipboard(webhook.token, 'Token')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Testar Conexão
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
    </MainLayout>
  );
};

export default WebhooksPage;
