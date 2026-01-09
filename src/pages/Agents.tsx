import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { AgentCard } from '@/components/agents/AgentCard';
import { CreateAgentModal, AgentFormData } from '@/components/agents/CreateAgentModal';
import { Button } from '@/components/ui/button';
import { Agent } from '@/types/agent';
import { useToast } from '@/hooks/use-toast';

const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'Atendente Virtual',
    description: 'Agente para atendimento inicial de clientes, responde dúvidas frequentes e direciona para setores.',
    prompt: 'Você é um atendente virtual prestativo...',
    status: 'online',
    instanceName: 'atendimento-principal',
    webhookUrl: 'https://evolution.example.com/webhook',
    token: 'secret-token-123',
    messagesCount: 1247,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    name: 'Suporte Técnico',
    description: 'Especializado em resolver problemas técnicos e orientar usuários sobre uso do sistema.',
    prompt: 'Você é um especialista em suporte técnico...',
    status: 'online',
    instanceName: 'suporte-tech',
    webhookUrl: 'https://evolution.example.com/webhook',
    token: 'secret-token-456',
    messagesCount: 892,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '3',
    name: 'Vendas',
    description: 'Agente de vendas que apresenta produtos e auxilia no processo de compra.',
    prompt: 'Você é um vendedor consultivo...',
    status: 'offline',
    instanceName: 'vendas-bot',
    webhookUrl: 'https://evolution.example.com/webhook',
    token: 'secret-token-789',
    messagesCount: 456,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const AgentsPage = () => {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const { toast } = useToast();

  const handleCreateAgent = (data: AgentFormData) => {
    const newAgent: Agent = {
      id: Date.now().toString(),
      ...data,
      status: 'offline',
      messagesCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setAgents(prev => [...prev, newAgent]);
    setCreateModalOpen(false);
    toast({
      title: 'Agente criado!',
      description: `${data.name} foi criado com sucesso.`,
    });
  };

  const handleToggleStatus = (id: string) => {
    setAgents(prev => prev.map(agent => 
      agent.id === id 
        ? { ...agent, status: agent.status === 'online' ? 'offline' : 'online' }
        : agent
    ));
  };

  const handleDeleteAgent = (id: string) => {
    setAgents(prev => prev.filter(agent => agent.id !== id));
    toast({
      title: 'Agente excluído',
      description: 'O agente foi removido com sucesso.',
      variant: 'destructive',
    });
  };

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

      <CreateAgentModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSubmit={handleCreateAgent}
      />
    </MainLayout>
  );
};

export default AgentsPage;
