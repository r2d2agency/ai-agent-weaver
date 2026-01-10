import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Upload, Trash2, File, FileType, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string;
  created_at: string;
}

interface AgentDocumentsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: {
    id: string;
    name: string;
  } | null;
}

export function AgentDocumentsModal({ open, onOpenChange, agent }: AgentDocumentsModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newDocName, setNewDocName] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [isAddingManual, setIsAddingManual] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', agent?.id],
    queryFn: async () => {
      if (!agent?.id) return [];
      const response = await fetch(`${API_BASE_URL}/api/documents/agent/${agent.id}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      return response.json();
    },
    enabled: !!agent?.id && open,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { name: string; content: string; type: string; size: number }) => {
      const response = await fetch(`${API_BASE_URL}/api/documents/agent/${agent?.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to upload document');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', agent?.id] });
      toast({ title: 'Documento adicionado!', description: 'O documento foi salvo com sucesso.' });
      setNewDocName('');
      setNewDocContent('');
      setIsAddingManual(false);
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Não foi possível salvar o documento.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_BASE_URL}/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete document');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents', agent?.id] });
      toast({ title: 'Documento excluído', description: 'O documento foi removido.' });
    },
  });

  const handleFileUpload = async (files: FileList) => {
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        uploadMutation.mutate({
          name: file.name,
          content,
          type: file.type || 'text/plain',
          size: file.size,
        });
      } catch (error) {
        toast({
          title: 'Erro ao ler arquivo',
          description: `Não foi possível ler ${file.name}`,
          variant: 'destructive',
        });
      }
    }
  };

  const handleManualAdd = () => {
    if (!newDocName.trim() || !newDocContent.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o nome e o conteúdo do documento.',
        variant: 'destructive',
      });
      return;
    }
    uploadMutation.mutate({
      name: newDocName.trim(),
      content: newDocContent.trim(),
      type: 'text/plain',
      size: newDocContent.length,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Base de Conhecimento: {agent?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Upload Area */}
          <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Arraste arquivos ou{' '}
              <button
                className="text-primary hover:underline"
                onClick={() => fileInputRef.current?.click()}
              >
                clique para selecionar
              </button>
            </p>
            <p className="text-xs text-muted-foreground">TXT, MD, JSON, CSV</p>
          </div>

          {/* Manual Add */}
          {!isAddingManual ? (
            <Button variant="outline" onClick={() => setIsAddingManual(true)} className="w-full">
              <FileText className="w-4 h-4 mr-2" />
              Adicionar texto manualmente
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 p-4 border border-border rounded-lg"
            >
              <div className="flex items-center justify-between">
                <Label>Novo Documento</Label>
                <Button variant="ghost" size="icon" onClick={() => setIsAddingManual(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <Input
                placeholder="Nome do documento (ex: FAQ Produtos)"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                className="bg-muted border-border"
              />
              <Textarea
                placeholder="Cole aqui o conteúdo do documento. Este texto será usado pelo agente para responder perguntas."
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                className="bg-muted border-border min-h-[120px]"
              />
              <Button
                onClick={handleManualAdd}
                disabled={uploadMutation.isPending}
                className="w-full btn-primary-gradient"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Salvar Documento
              </Button>
            </motion.div>
          )}

          {/* Documents List */}
          <ScrollArea className="flex-1 min-h-[200px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground">Nenhum documento na base de conhecimento</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Adicione documentos para o agente consultar nas respostas
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence>
                  {documents.map((doc: Document) => (
                    <motion.div
                      key={doc.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                          <File className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatSize(doc.size)} • {doc.content?.substring(0, 50)}...
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
