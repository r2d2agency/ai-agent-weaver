import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Search, Loader2, User, Bot, ChevronRight } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { getMessages } from '@/lib/api';
import { useAgents } from '@/hooks/use-agents';

interface Message {
  id: string;
  agent_id: string;
  phone_number: string;
  sender: 'user' | 'agent' | 'owner';
  content: string;
  created_at: string;
  is_audio?: boolean;
}

interface Conversation {
  phoneNumber: string;
  agentId: string;
  agentName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
}

const MessagesPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages'],
    queryFn: () => getMessages(),
  });

  const { data: agentsData } = useAgents();

  const messages: Message[] = messagesData || [];
  const agents = agentsData || [];

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a: any) => a.id === agentId);
    return agent?.name || 'Agente Desconhecido';
  };

  // Group messages by agent and then by phone number (conversation)
  const conversationsByAgent = useMemo(() => {
    const agentMap: Record<string, { agentName: string; conversations: Record<string, Conversation> }> = {};

    messages.forEach((msg) => {
      if (!agentMap[msg.agent_id]) {
        agentMap[msg.agent_id] = {
          agentName: getAgentName(msg.agent_id),
          conversations: {},
        };
      }

      const convKey = msg.phone_number;
      if (!agentMap[msg.agent_id].conversations[convKey]) {
        agentMap[msg.agent_id].conversations[convKey] = {
          phoneNumber: msg.phone_number,
          agentId: msg.agent_id,
          agentName: getAgentName(msg.agent_id),
          lastMessage: msg.content,
          lastMessageTime: msg.created_at,
          unreadCount: 0,
          messages: [],
        };
      }

      agentMap[msg.agent_id].conversations[convKey].messages.push(msg);

      // Update last message if this one is newer
      const conv = agentMap[msg.agent_id].conversations[convKey];
      if (new Date(msg.created_at) > new Date(conv.lastMessageTime)) {
        conv.lastMessage = msg.content;
        conv.lastMessageTime = msg.created_at;
      }
    });

    // Sort messages within each conversation by time
    Object.values(agentMap).forEach((agentData) => {
      Object.values(agentData.conversations).forEach((conv) => {
        conv.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    });

    return agentMap;
  }, [messages, agents]);

  // Filter conversations based on search
  const filteredAgents = useMemo(() => {
    if (!searchTerm) return conversationsByAgent;

    const filtered: typeof conversationsByAgent = {};
    const term = searchTerm.toLowerCase();

    Object.entries(conversationsByAgent).forEach(([agentId, agentData]) => {
      const matchingConvs: Record<string, Conversation> = {};

      Object.entries(agentData.conversations).forEach(([phone, conv]) => {
        const matchesPhone = conv.phoneNumber.includes(term);
        const matchesContent = conv.messages.some((m) => m.content.toLowerCase().includes(term));
        const matchesAgent = agentData.agentName.toLowerCase().includes(term);

        if (matchesPhone || matchesContent || matchesAgent) {
          matchingConvs[phone] = conv;
        }
      });

      if (Object.keys(matchingConvs).length > 0) {
        filtered[agentId] = { ...agentData, conversations: matchingConvs };
      }
    });

    return filtered;
  }, [conversationsByAgent, searchTerm]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);

    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes}min`;
    if (minutes < 1440) return `há ${Math.floor(minutes / 60)}h`;
    return date.toLocaleDateString('pt-BR');
  };

  const formatFullTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  if (messagesLoading) {
    return (
      <MainLayout>
        <Header title="Mensagens" subtitle="Histórico de conversas dos seus agentes" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header title="Mensagens" subtitle="Histórico de conversas dos seus agentes" />

      <div className="flex gap-6 h-[calc(100vh-200px)]">
        {/* Left sidebar - Agents and Conversations */}
        <div className="w-80 flex flex-col glass-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {Object.keys(filteredAgents).length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              Object.entries(filteredAgents).map(([agentId, agentData]) => (
                <div key={agentId} className="border-b border-border last:border-b-0">
                  <div className="px-4 py-3 bg-accent/30 sticky top-0">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{agentData.agentName}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {Object.keys(agentData.conversations).length}
                      </Badge>
                    </div>
                  </div>

                  {Object.values(agentData.conversations)
                    .sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime())
                    .map((conv) => (
                      <motion.div
                        key={`${agentId}-${conv.phoneNumber}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-4 cursor-pointer transition-colors hover:bg-accent/50 border-l-2 ${
                          selectedConversation?.phoneNumber === conv.phoneNumber &&
                          selectedConversation?.agentId === conv.agentId
                            ? 'bg-accent/50 border-l-primary'
                            : 'border-l-transparent'
                        }`}
                        onClick={() => setSelectedConversation(conv)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-info/20 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-info" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm truncate">{conv.phoneNumber}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatTime(conv.lastMessageTime)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-1">{conv.lastMessage}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </motion.div>
                    ))}
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Right side - Chat view */}
        <div className="flex-1 glass-card overflow-hidden flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat header */}
              <div className="p-4 border-b border-border bg-card/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-info/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <h3 className="font-medium">{selectedConversation.phoneNumber}</h3>
                    <p className="text-xs text-muted-foreground">
                      via {selectedConversation.agentName} • {selectedConversation.messages.length} mensagens
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {selectedConversation.messages.map((msg, index) => {
                    const isUser = msg.sender === 'user';
                    const isOwner = msg.sender === 'owner';
                    const showDateSeparator =
                      index === 0 ||
                      new Date(msg.created_at).toDateString() !==
                        new Date(selectedConversation.messages[index - 1].created_at).toDateString();

                    return (
                      <div key={msg.id}>
                        {showDateSeparator && (
                          <div className="flex items-center justify-center my-4">
                            <span className="px-3 py-1 text-xs bg-accent rounded-full text-muted-foreground">
                              {new Date(msg.created_at).toLocaleDateString('pt-BR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                              })}
                            </span>
                          </div>
                        )}
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}
                        >
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                              isUser
                                ? 'bg-accent text-foreground rounded-bl-md'
                                : isOwner
                                  ? 'bg-warning/20 text-foreground rounded-br-md'
                                  : 'bg-primary text-primary-foreground rounded-br-md'
                            }`}
                          >
                            {(isOwner || !isUser) && (
                              <div className="flex items-center gap-1 mb-1">
                                <span className="text-xs opacity-70">
                                  {isOwner ? '👤 Você' : `🤖 ${selectedConversation.agentName}`}
                                </span>
                              </div>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <div className={`text-xs mt-1 ${isUser ? 'text-muted-foreground' : 'opacity-70'}`}>
                              {formatFullTime(msg.created_at)}
                              {msg.is_audio && ' 🎤'}
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium text-lg mb-2">Selecione uma conversa</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha uma conversa na lista à esquerda para visualizar as mensagens
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default MessagesPage;
