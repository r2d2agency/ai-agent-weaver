import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, User, Bot, Search, Phone, Clock, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { API_BASE_URL, deleteConversation } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Conversation {
  phone_number: string;
  message_count: number;
  last_message_at: string;
  last_message: string;
  last_sender: 'user' | 'agent';
}

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  created_at: string;
  is_audio?: boolean;
}

interface AgentConversationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: {
    id: string;
    name: string;
  } | null;
}

export function AgentConversationsModal({ open, onOpenChange, agent }: AgentConversationsModalProps) {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ['conversations', agent?.id],
    queryFn: async () => {
      if (!agent?.id) return [];
      const response = await fetch(`${API_BASE_URL}/api/conversations/agent/${agent.id}`);
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    enabled: !!agent?.id && open,
  });

  const handleDeleteConversation = async () => {
    if (!agent?.id || !deleteTarget) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteConversation(agent.id, deleteTarget);
      toast.success(`Conversa apagada (${result.deletedCount} mensagens)`);
      
      // If we're viewing the deleted conversation, go back
      if (selectedPhone === deleteTarget) {
        setSelectedPhone(null);
      }
      
      // Refresh the conversations list
      queryClient.invalidateQueries({ queryKey: ['conversations', agent.id] });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast.error('Erro ao apagar conversa');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const { data: conversationData, isLoading: loadingMessages } = useQuery({
    queryKey: ['conversation', agent?.id, selectedPhone],
    queryFn: async () => {
      if (!agent?.id || !selectedPhone) return null;
      const response = await fetch(
        `${API_BASE_URL}/api/conversations/agent/${agent.id}/phone/${encodeURIComponent(selectedPhone)}`
      );
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: !!agent?.id && !!selectedPhone,
  });

  const filteredConversations = conversations.filter((conv: Conversation) =>
    conv.phone_number.includes(searchTerm) ||
    conv.last_message?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) setSelectedPhone(null);
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[900px] h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Conversas: {agent?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* Conversations List */}
          <div className={`${selectedPhone ? 'w-1/3 border-r border-border' : 'w-full'} flex flex-col`}>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por telefone ou mensagem..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-muted border-border"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              {loadingConversations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
                </div>
              ) : (
                filteredConversations.map((conv: Conversation) => (
                  <motion.div
                    key={conv.phone_number}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedPhone(conv.phone_number)}
                    className={`p-3 cursor-pointer hover:bg-accent/30 transition-colors border-b border-border/50 ${
                      selectedPhone === conv.phone_number ? 'bg-accent/50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Phone className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{formatPhone(conv.phone_number)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatTime(conv.last_message_at)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(conv.phone_number);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pl-10">
                      <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {conv.last_sender === 'agent' && <Bot className="w-3 h-3 inline mr-1" />}
                        {conv.last_message}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {conv.message_count} msgs
                      </Badge>
                    </div>
                  </motion.div>
                ))
              )}
            </ScrollArea>
          </div>

          {/* Messages View */}
          {selectedPhone && (
            <div className="flex-1 flex flex-col">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="font-medium">{formatPhone(selectedPhone)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPhone(null)}>
                  Voltar
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : conversationData?.messages?.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Sem mensagens</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {conversationData?.messages?.map((msg: Message) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div className={`flex gap-2 max-w-[80%] ${msg.sender === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            msg.sender === 'user' ? 'bg-info/10' : 'bg-primary/10'
                          }`}>
                            {msg.sender === 'user' ? (
                              <User className="w-3 h-3 text-info" />
                            ) : (
                              <Bot className="w-3 h-3 text-primary" />
                            )}
                          </div>
                          <div className={`rounded-2xl px-3 py-2 ${
                            msg.sender === 'user'
                              ? 'bg-muted text-foreground'
                              : 'bg-primary text-primary-foreground'
                          }`}>
                            {msg.is_audio && (
                              <Badge variant="outline" className="text-[10px] mb-1">🎤 Áudio</Badge>
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            <p className="text-[10px] opacity-60 mt-1">
                              {new Date(msg.created_at).toLocaleTimeString('pt-BR', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens desta conversa com {deleteTarget && formatPhone(deleteTarget)} serão permanentemente apagadas.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
