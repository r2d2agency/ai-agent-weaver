import { motion } from 'framer-motion';
import { Bot, MessageSquare, Zap, TrendingUp, Plus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AgentCard } from '@/components/agents/AgentCard';
import { CreateAgentModal, AgentFormData } from '@/components/agents/CreateAgentModal';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
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

const Dashboard = () => {
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

  const onlineAgents = agents.filter(a => a.status === 'online').length;
  const totalMessages = agents.reduce((acc, a) => acc + a.messagesCount, 0);

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
          change="+2 este mês"
          changeType="positive"
          icon={Bot}
          delay={0}
        />
        <StatsCard
          title="Agentes Online"
          value={onlineAgents}
          change={`${Math.round((onlineAgents / agents.length) * 100)}% ativos`}
          changeType="positive"
          icon={Zap}
          delay={0.1}
        />
        <StatsCard
          title="Mensagens Hoje"
          value={totalMessages.toLocaleString()}
          change="+12% vs ontem"
          changeType="positive"
          icon={MessageSquare}
          delay={0.2}
        />
        <StatsCard
          title="Taxa de Resposta"
          value="98.5%"
          change="+0.5% esta semana"
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
          {[
            { agent: 'Atendente Virtual', action: 'Respondeu mensagem', time: 'há 2 min', phone: '+55 11 9****-1234' },
            { agent: 'Suporte Técnico', action: 'Encerrou conversa', time: 'há 5 min', phone: '+55 21 9****-5678' },
            { agent: 'Atendente Virtual', action: 'Iniciou atendimento', time: 'há 8 min', phone: '+55 31 9****-9012' },
            { agent: 'Vendas', action: 'Enviou proposta', time: 'há 15 min', phone: '+55 41 9****-3456' },
          ].map((activity, index) => (
            <div key={index} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{activity.agent}</p>
                  <p className="text-sm text-muted-foreground">{activity.action}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{activity.phone}</p>
                <p className="text-xs text-muted-foreground">{activity.time}</p>
              </div>
            </div>
          ))}
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
