import { motion } from 'framer-motion';
import { Bot, MessageSquare, Zap, TrendingUp, Plus, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AgentCard } from '@/components/agents/AgentCard';
import { CreateAgentModal, AgentFormData } from '@/components/agents/CreateAgentModal';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Agent } from '@/types/agent';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from '@/hooks/use-agents';
import { getMessages } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

const Dashboard = () => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  
  const { data: agentsData, isLoading: agentsLoading, error: agentsError } = useAgents();
  const { data: messagesData } = useQuery({
    queryKey: ['messages'],
    queryFn: () => getMessages(),
  });
  
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

  // Transform API data to Agent type
  const agents: Agent[] = (agentsData || []).map((agent: any) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description || '',
    prompt: agent.prompt || '',
    status: agent.status || 'offline',
    instanceName: agent.instance_name || '',
    webhookUrl: agent.webhook_url || '',
    token: agent.token || '',
    messagesCount: agent.messages_count || 0,
    createdAt: new Date(agent.created_at),
    updatedAt: new Date(agent.updated_at),
  }));

  // Get recent messages for activity feed
  const recentMessages = (messagesData || []).slice(0, 5);

  const handleCreateAgent = async (data: AgentFormData) => {
    await createAgent.mutateAsync(data);
    setCreateModalOpen(false);
  };

  const handleToggleStatus = (id: string) => {
    const agent = agents.find(a => a.id === id);
    if (agent) {
      updateAgent.mutate({
        id,
        data: { status: agent.status === 'online' ? 'offline' : 'online' }
      });
    }
  };

  const handleDeleteAgent = (id: string) => {
    deleteAgent.mutate(id);
  };

  const onlineAgents = agents.filter(a => a.status === 'online').length;
  const totalMessages = agents.reduce((acc, a) => acc + a.messagesCount, 0);

  if (agentsLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (agentsError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Erro ao carregar dados</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Dashboard" 
        subtitle="Visão geral dos seus agentes de IA"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total de Agentes"
          value={agents.length}
          change={agents.length > 0 ? `${agents.length} configurado(s)` : 'Nenhum agente'}
          changeType="positive"
          icon={Bot}
          delay={0}
        />
        <StatsCard
          title="Agentes Online"
          value={onlineAgents}
          change={agents.length > 0 ? `${Math.round((onlineAgents / agents.length) * 100)}% ativos` : '0% ativos'}
          changeType="positive"
          icon={Zap}
          delay={0.1}
        />
        <StatsCard
          title="Total de Mensagens"
          value={totalMessages.toLocaleString()}
          change="Todas as conversas"
          changeType="positive"
          icon={MessageSquare}
          delay={0.2}
        />
        <StatsCard
          title="Taxa de Resposta"
          value="100%"
          change="Automático"
          changeType="positive"
          icon={TrendingUp}
          delay={0.3}
        />
      </div>

      {/* Agents Section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Seus Agentes</h2>
          <p className="text-sm text-muted-foreground">Gerencie e monitore seus agentes de IA</p>
        </div>
        <Button 
          className="btn-primary-gradient"
          onClick={() => setCreateModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map((agent, index) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            delay={index * 0.1}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDeleteAgent}
          />
        ))}

        {/* Add Agent Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: agents.length * 0.1, duration: 0.3 }}
          onClick={() => setCreateModalOpen(true)}
          className="glass-card border-dashed border-2 border-border hover:border-primary/50 p-6 flex flex-col items-center justify-center min-h-[200px] cursor-pointer transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <p className="font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            Criar novo agente
          </p>
        </motion.div>
      </div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <h2 className="text-xl font-semibold text-foreground mb-4">Atividade Recente</h2>
        <div className="glass-card divide-y divide-border">
          {recentMessages.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhuma atividade recente</p>
            </div>
          ) : (
            recentMessages.map((message: any, index: number) => {
              const agent = agents.find(a => a.id === message.agent_id);
              const time = new Date(message.created_at);
              const diff = Date.now() - time.getTime();
              const minutes = Math.floor(diff / 1000 / 60);
              const timeStr = minutes < 1 ? 'agora' : 
                              minutes < 60 ? `há ${minutes} min` : 
                              minutes < 1440 ? `há ${Math.floor(minutes / 60)}h` : 
                              time.toLocaleDateString('pt-BR');
              
              const maskedPhone = message.phone_number?.replace(/(\d{2})(\d{5})(\d{4})/, '+55 $1 9****-$3') || 'Desconhecido';
              
              return (
                <div key={message.id || index} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{agent?.name || 'Agente'}</p>
                      <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                        {message.sender === 'user' ? 'Recebeu mensagem' : 'Respondeu mensagem'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{maskedPhone}</p>
                    <p className="text-xs text-muted-foreground">{timeStr}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>

      <CreateAgentModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreateAgent}
      />
    </MainLayout>
  );
};

export default Dashboard;
