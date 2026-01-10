import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { AgentCard } from '@/components/agents/AgentCard';
import { CreateAgentModal, AgentFormData } from '@/components/agents/CreateAgentModal';
import { Button } from '@/components/ui/button';
import { Agent } from '@/types/agent';
import { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from '@/hooks/use-agents';

const AgentsPage = () => {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  
  const { data: agentsData, isLoading, error } = useAgents();
  const createAgentMutation = useCreateAgent();
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();

  // Transform API data to Agent type
  const agents: Agent[] = (agentsData || []).map((a: any) => ({
    id: a.id,
    name: a.name,
    description: a.description || '',
    prompt: a.prompt,
    status: a.status || 'offline',
    instanceName: a.instance_name,
    webhookUrl: a.webhook_url || '',
    token: a.token || '',
    messagesCount: a.messages_count || 0,
    createdAt: new Date(a.created_at),
    updatedAt: new Date(a.updated_at),
  }));

  const handleCreateAgent = (data: AgentFormData) => {
    createAgentMutation.mutate(data, {
      onSuccess: () => setCreateModalOpen(false),
    });
  };

  const handleToggleStatus = (id: string) => {
    const agent = agents.find(a => a.id === id);
    if (agent) {
      updateAgentMutation.mutate({
        id,
        data: { status: agent.status === 'online' ? 'offline' : 'online' },
      });
    }
  };

  const handleDeleteAgent = (id: string) => {
    deleteAgentMutation.mutate(id);
  };

  if (error) {
    return (
      <MainLayout>
        <Header 
          title="Agentes" 
          subtitle="Gerencie seus agentes de IA para WhatsApp"
        />
        <div className="glass-card p-8 text-center">
          <p className="text-destructive mb-4">Erro ao conectar com o backend</p>
          <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Agentes" 
        subtitle="Gerencie seus agentes de IA para WhatsApp"
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" className="border-primary text-primary">
            Todos ({agents.length})
          </Button>
          <Button variant="ghost" size="sm">
            Online ({agents.filter(a => a.status === 'online').length})
          </Button>
          <Button variant="ghost" size="sm">
            Offline ({agents.filter(a => a.status === 'offline').length})
          </Button>
        </div>
        <Button 
          className="btn-primary-gradient"
          onClick={() => setCreateModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Agente
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
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
      )}

      <CreateAgentModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreateAgent}
        isLoading={createAgentMutation.isPending}
      />
    </MainLayout>
  );
};

export default AgentsPage;
