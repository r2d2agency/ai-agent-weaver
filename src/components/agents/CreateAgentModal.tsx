import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Upload, Wand2, X, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AgentFormData) => void;
}

export interface AgentFormData {
  name: string;
  description: string;
  prompt: string;
  instanceName: string;
  webhookUrl: string;
  token: string;
  documents: File[];
}

export function CreateAgentModal({ open, onOpenChange, onSubmit }: CreateAgentModalProps) {
  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    description: '',
    prompt: '',
    instanceName: '',
    webhookUrl: '',
    token: '',
    documents: [],
  });
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFormData(prev => ({
        ...prev,
        documents: [...prev.documents, ...newFiles],
      }));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFormData(prev => ({
        ...prev,
        documents: [...prev.documents, ...newFiles],
      }));
    }
  };

  const removeDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      name: '',
      description: '',
      prompt: '',
      instanceName: '',
      webhookUrl: '',
      token: '',
      documents: [],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Bot className="w-5 h-5 text-primary" />
            Criar Novo Agente
          </DialogTitle>
          <DialogDescription>
            Configure seu agente de IA para WhatsApp
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Agente</Label>
              <Input
                id="name"
                placeholder="Ex: Atendente Virtual"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-muted border-border"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instanceName">Nome da Instância</Label>
              <Input
                id="instanceName"
                placeholder="Ex: minha-instancia"
                value={formData.instanceName}
                onChange={(e) => setFormData(prev => ({ ...prev, instanceName: e.target.value }))}
                className="bg-muted border-border"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Descreva brevemente o propósito do agente"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="bg-muted border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt do Sistema</Label>
            <Textarea
              id="prompt"
              placeholder="Instruções para o agente. Ex: Você é um assistente virtual prestativo..."
              value={formData.prompt}
              onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
              className="bg-muted border-border min-h-[120px]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">URL do Webhook</Label>
              <Input
                id="webhookUrl"
                placeholder="https://..."
                value={formData.webhookUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                className="bg-muted border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Token de Autenticação</Label>
              <Input
                id="token"
                type="password"
                placeholder="Token secreto"
                value={formData.token}
                onChange={(e) => setFormData(prev => ({ ...prev, token: e.target.value }))}
                className="bg-muted border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Documentos de Contexto (opcional)</Label>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive ? 'border-primary bg-primary/5' : 'border-border'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Arraste arquivos aqui ou clique para selecionar
              </p>
              <p className="text-xs text-muted-foreground">
                PDF, TXT, DOCX até 10MB
              </p>
              <input
                type="file"
                multiple
                accept=".pdf,.txt,.docx"
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                Selecionar Arquivos
              </Button>
            </div>

            {formData.documents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2 mt-4"
              >
                {formData.documents.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-muted rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-sm text-foreground">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDocument(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="btn-primary-gradient">
              <Wand2 className="w-4 h-4 mr-2" />
              Criar Agente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
