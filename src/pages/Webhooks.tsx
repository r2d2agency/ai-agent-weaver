import { motion } from 'framer-motion';
import { Webhook, Copy, RefreshCw, CheckCircle, AlertCircle, Loader2, Bot } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAgents } from '@/hooks/use-agents';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '@/lib/api';
const WebhooksPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: agentsData, isLoading, error } = useAgents();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado!',
      description: `${label} copiado para a área de transferência.`,
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <Header 
          title="Webhooks" 
          subtitle="Configure os endpoints para receber mensagens da Evolution API"
        />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <Header 
          title="Webhooks" 
          subtitle="Configure os endpoints para receber mensagens da Evolution API"
        />
        <div className="glass-card p-8 text-center">
          <p className="text-destructive mb-4">Erro ao conectar com o backend</p>
          <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
        </div>
      </MainLayout>
    );
  }

  const agents = agentsData || [];

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
            <p>1. Crie um agente na página de <button onClick={() => navigate('/agents')} className="text-primary hover:underline">Agentes</button></p>
            <p>2. Copie a URL do webhook gerada automaticamente abaixo</p>
            <p>3. No painel da Evolution API, vá em Configurações → Webhook da instância</p>
            <p>4. Cole a URL e ative o evento: <code className="bg-muted px-2 py-1 rounded">messages.upsert</code></p>
          </div>
        </motion.div>
      </div>

      {agents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-8 text-center"
        >
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Nenhum agente criado</h3>
          <p className="text-muted-foreground mb-4">
            Crie um agente primeiro para gerar o webhook automaticamente.
          </p>
          <Button onClick={() => navigate('/agents')} className="btn-primary-gradient">
            Ir para Agentes
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {agents.map((agent: any, index: number) => {
            const webhookUrl = `${API_BASE_URL}/webhook/${agent.instance_name}`;
            
            return (
              <motion.div
                key={agent.id}
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
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {agent.status === 'online' ? (
                          <Badge className="bg-success/20 text-success border-0">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Inativo
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Instância: {agent.instance_name}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">
                      {(agent.messages_count || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">mensagens</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-24">Webhook URL:</span>
                    <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-sm text-primary font-mono truncate">
                      {webhookUrl}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => copyToClipboard(webhookUrl, 'URL do Webhook')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate(`/agents/${agent.id}`)}
                  >
                    Ver Agente
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </MainLayout>
  );
};

export default WebhooksPage;
