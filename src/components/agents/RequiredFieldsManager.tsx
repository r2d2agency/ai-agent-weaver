import { useState } from 'react';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

export interface RequiredField {
  key: string;
  question: string;
}

interface RequiredFieldsManagerProps {
  fields: RequiredField[];
  onChange: (fields: RequiredField[]) => void;
}

export function RequiredFieldsManager({ fields, onChange }: RequiredFieldsManagerProps) {
  const [newKey, setNewKey] = useState('');
  const [newQuestion, setNewQuestion] = useState('');

  const handleAdd = () => {
    if (!newKey.trim() || !newQuestion.trim()) return;
    
    // Normalize key (lowercase, no spaces)
    const normalizedKey = newKey.toLowerCase().trim().replace(/\s+/g, '_');
    
    // Check for duplicates
    if (fields.some(f => f.key === normalizedKey)) {
      return;
    }

    onChange([...fields, { key: normalizedKey, question: newQuestion.trim() }]);
    setNewKey('');
    setNewQuestion('');
  };

  const handleRemove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing Fields */}
      <AnimatePresence>
        {fields.map((field, index) => (
          <motion.div
            key={field.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg border border-border"
          >
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {field.key}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{field.question}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(index)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </motion.div>
        ))}
      </AnimatePresence>

      {fields.length === 0 && (
        <div className="flex items-center gap-2 p-4 bg-muted/30 rounded-lg border border-dashed border-border">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhuma variável obrigatória configurada. A IA poderá transferir sem coletar dados.
          </p>
        </div>
      )}

      {/* Add New Field */}
      <div className="space-y-3 p-4 bg-accent/10 rounded-lg border border-border">
        <Label className="text-xs font-medium">Adicionar Nova Variável</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nome da variável</Label>
            <Input
              placeholder="Ex: nome, cpf, pedido"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pergunta para coletar</Label>
            <Input
              placeholder="Ex: Qual o seu nome completo?"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-background border-border"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!newKey.trim() || !newQuestion.trim()}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Variável
        </Button>
      </div>

      {fields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          💡 A IA vai coletar essas informações naturalmente durante a conversa. Antes de transferir, 
          ela verificará se todas foram preenchidas e perguntará as que faltam.
        </p>
      )}
    </div>
  );
}
