import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getFaqs, getFaqStats, createFaq, updateFaq, deleteFaq } from '@/lib/api';
import { Plus, Trash2, Edit2, Save, X, HelpCircle, TrendingUp, Zap, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentFaqModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: { id: string; name: string } | null;
}

interface Faq {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  usage_count: number;
  is_active: boolean;
  created_at: string;
}

export function AgentFaqModal({ open, onOpenChange, agent }: AgentFaqModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ question: '', answer: '', keywords: '' });

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ['faqs', agent?.id],
    queryFn: () => getFaqs(agent!.id),
    enabled: !!agent?.id && open,
  });

  const { data: stats } = useQuery({
    queryKey: ['faq-stats', agent?.id],
    queryFn: () => getFaqStats(agent!.id),
    enabled: !!agent?.id && open,
  });

  const createMutation = useMutation({
    mutationFn: (data: { question: string; answer: string; keywords?: string[] }) => 
      createFaq(agent!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs', agent?.id] });
      queryClient.invalidateQueries({ queryKey: ['faq-stats', agent?.id] });
      toast({ title: 'FAQ criada!', description: 'A pergunta frequente foi adicionada.' });
      resetForm();
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível criar a FAQ.', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ faqId, data }: { faqId: string; data: Partial<Faq> }) =>
      updateFaq(agent!.id, faqId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs', agent?.id] });
      toast({ title: 'FAQ atualizada!' });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (faqId: string) => deleteFaq(agent!.id, faqId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['faqs', agent?.id] });
      queryClient.invalidateQueries({ queryKey: ['faq-stats', agent?.id] });
      toast({ title: 'FAQ excluída!' });
    },
  });

  const resetForm = () => {
    setFormData({ question: '', answer: '', keywords: '' });
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!formData.question.trim() || !formData.answer.trim()) {
      toast({ title: 'Preencha pergunta e resposta', variant: 'destructive' });
      return;
    }

    const keywords = formData.keywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);

    if (editingId) {
      updateMutation.mutate({
        faqId: editingId,
        data: { question: formData.question, answer: formData.answer, keywords },
      });
    } else {
      createMutation.mutate({
        question: formData.question,
        answer: formData.answer,
        keywords: keywords.length > 0 ? keywords : undefined,
      });
    }
  };

  const startEdit = (faq: Faq) => {
    setEditingId(faq.id);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      keywords: faq.keywords?.join(', ') || '',
    });
    setIsCreating(true);
  };

  if (!agent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" />
            FAQs - {agent.name}
          </DialogTitle>
        </DialogHeader>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 py-2">
          <div className="glass-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <MessageSquare className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold">{faqs.length}</p>
            <p className="text-xs text-muted-foreground">FAQs cadastradas</p>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-500 mb-1">
              <Zap className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold">{stats?.totalApiCallsSaved || 0}</p>
            <p className="text-xs text-muted-foreground">Chamadas API salvas</p>
          </div>
          <div className="glass-card p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <TrendingUp className="w-4 h-4" />
            </div>
            <p className="text-xl font-bold">
              {faqs.reduce((sum: number, f: Faq) => sum + f.usage_count, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Usos totais</p>
          </div>
        </div>

        {/* Create/Edit Form */}
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-card p-4 space-y-3"
            >
              <div className="space-y-2">
                <Label className="text-sm">Pergunta</Label>
                <Input
                  value={formData.question}
                  onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Ex: Qual o horário de funcionamento?"
                  className="bg-muted border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Resposta</Label>
                <Textarea
                  value={formData.answer}
                  onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                  placeholder="Ex: Nosso horário de funcionamento é das 9h às 18h, de segunda a sexta."
                  className="bg-muted border-border min-h-[80px]"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Palavras-chave (opcional, separadas por vírgula)</Label>
                <Input
                  value={formData.keywords}
                  onChange={(e) => setFormData(prev => ({ ...prev, keywords: e.target.value }))}
                  placeholder="Ex: horário, funcionamento, abre, fecha"
                  className="bg-muted border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Ajuda o sistema a identificar quando usar esta resposta
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
                <Button 
                  size="sm" 
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary-gradient"
                >
                  <Save className="w-4 h-4 mr-1" />
                  {editingId ? 'Atualizar' : 'Salvar'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Button */}
        {!isCreating && (
          <Button 
            variant="outline" 
            className="w-full border-dashed"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar FAQ
          </Button>
        )}

        {/* FAQ List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-2 pr-4">
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : faqs.length === 0 ? (
              <div className="text-center py-8">
                <HelpCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">Nenhuma FAQ cadastrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adicione perguntas frequentes para economizar chamadas de API
                </p>
              </div>
            ) : (
              faqs.map((faq: Faq) => (
                <motion.div
                  key={faq.id}
                  layout
                  className={`glass-card p-4 ${!faq.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{faq.question}</p>
                        {faq.usage_count > 0 && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {faq.usage_count}x usado
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{faq.answer}</p>
                      {faq.keywords && faq.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {faq.keywords.slice(0, 5).map((kw, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                          {faq.keywords.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{faq.keywords.length - 5}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={faq.is_active}
                        onCheckedChange={(checked) => 
                          updateMutation.mutate({ faqId: faq.id, data: { is_active: checked } })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(faq)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(faq.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
