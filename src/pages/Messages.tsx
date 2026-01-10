import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Search, Filter, Loader2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { getMessages } from '@/lib/api';
import { useAgents } from '@/hooks/use-agents';

const MessagesPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages'],
    queryFn: () => getMessages(),
  });

  const { data: agentsData } = useAgents();

  const messages = messagesData || [];
  const agents = agentsData || [];

  const filteredMessages = messages.filter((msg: any) => {
    const matchesSearch = 
      msg.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.phone_number?.includes(searchTerm);
    const matchesAgent = selectedAgent === 'all' || msg.agent_id === selectedAgent;
    return matchesSearch && matchesAgent;
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    if (minutes < 1440) return `há ${Math.floor(minutes / 60)}h`;
    return date.toLocaleDateString('pt-BR');
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.name || 'Agente Desconhecido';
  };

  if (messagesLoading) {
    return (
      <MainLayout>
        <Header 
          title="Mensagens" 
          subtitle="Histórico de conversas dos seus agentes"
        />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Mensagens" 
        subtitle="Histórico de conversas dos seus agentes"
      />

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por conteúdo ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>
        
        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-48 bg-card border-border">
            <SelectValue placeholder="Filtrar por agente" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents.map((agent: any) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon">
          <Filter className="w-4 h-4" />
        </Button>
      </div>

      <div className="glass-card divide-y divide-border">
        {filteredMessages.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma mensagem encontrada</p>
          </div>
        ) : (
          filteredMessages.map((message: any, index: number) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="p-4 hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    message.sender === 'user' ? 'bg-info/20' : 'bg-primary/20'
                  }`}>
                    <MessageSquare className={`w-5 h-5 ${
                      message.sender === 'user' ? 'text-info' : 'text-primary'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground">
                        {message.sender === 'user' ? message.phone_number : getAgentName(message.agent_id)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {message.sender === 'user' ? 'Usuário' : 'Agente'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {message.content}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">
                        via {getAgentName(message.agent_id)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(message.created_at)}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`block mt-2 text-xs ${
                      message.sender === 'agent' ? 'text-success border-success' : 'text-info border-info'
                    }`}
                  >
                    {message.sender === 'agent' ? 'Respondida' : 'Recebida'}
                  </Badge>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </MainLayout>
  );
};

export default MessagesPage;
