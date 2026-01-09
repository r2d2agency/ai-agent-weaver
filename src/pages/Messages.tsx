import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Search, Filter } from 'lucide-react';
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
import { Message } from '@/types/agent';

const mockMessages: (Message & { agentName: string })[] = [
  {
    id: '1',
    agentId: '1',
    agentName: 'Atendente Virtual',
    sender: 'user',
    content: 'Olá, gostaria de saber sobre os produtos disponíveis',
    phoneNumber: '+55 11 99999-1234',
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
    status: 'read',
  },
  {
    id: '2',
    agentId: '1',
    agentName: 'Atendente Virtual',
    sender: 'agent',
    content: 'Olá! Claro, posso ajudá-lo. Temos várias categorias de produtos. Qual área você tem interesse?',
    phoneNumber: '+55 11 99999-1234',
    timestamp: new Date(Date.now() - 1000 * 60 * 1),
    status: 'delivered',
  },
  {
    id: '3',
    agentId: '2',
    agentName: 'Suporte Técnico',
    sender: 'user',
    content: 'Estou com problema no login do sistema',
    phoneNumber: '+55 21 98888-5678',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    status: 'read',
  },
  {
    id: '4',
    agentId: '2',
    agentName: 'Suporte Técnico',
    sender: 'agent',
    content: 'Entendo. Vou te ajudar a resolver isso. Primeiro, pode me informar qual mensagem de erro aparece?',
    phoneNumber: '+55 21 98888-5678',
    timestamp: new Date(Date.now() - 1000 * 60 * 4),
    status: 'delivered',
  },
  {
    id: '5',
    agentId: '1',
    agentName: 'Atendente Virtual',
    sender: 'user',
    content: 'Quero ver os preços de eletrônicos',
    phoneNumber: '+55 31 97777-9012',
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
    status: 'read',
  },
];

const MessagesPage = () => {
  const [messages] = useState(mockMessages);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = msg.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.phoneNumber.includes(searchTerm);
    const matchesAgent = selectedAgent === 'all' || msg.agentId === selectedAgent;
    return matchesSearch && matchesAgent;
  });

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    if (minutes < 1440) return `há ${Math.floor(minutes / 60)}h`;
    return date.toLocaleDateString('pt-BR');
  };

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
            <SelectItem value="1">Atendente Virtual</SelectItem>
            <SelectItem value="2">Suporte Técnico</SelectItem>
            <SelectItem value="3">Vendas</SelectItem>
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
          filteredMessages.map((message, index) => (
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
                        {message.sender === 'user' ? message.phoneNumber : message.agentName}
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
                        via {message.agentName}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(message.timestamp)}
                  </span>
                  <Badge 
                    variant="outline" 
                    className={`block mt-2 text-xs ${
                      message.status === 'read' ? 'text-success border-success' :
                      message.status === 'delivered' ? 'text-info border-info' :
                      'text-muted-foreground'
                    }`}
                  >
                    {message.status === 'read' ? 'Lida' :
                     message.status === 'delivered' ? 'Entregue' :
                     message.status === 'sent' ? 'Enviada' : 'Erro'}
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
