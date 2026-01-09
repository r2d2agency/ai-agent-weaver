import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Upload, Trash2, File, FileType, Clock } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
  linkedAgents: string[];
}

const mockDocuments: Document[] = [
  {
    id: '1',
    name: 'manual-atendimento.pdf',
    type: 'application/pdf',
    size: 2456000,
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    linkedAgents: ['Atendente Virtual', 'Suporte Técnico'],
  },
  {
    id: '2',
    name: 'faq-produtos.txt',
    type: 'text/plain',
    size: 45000,
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
    linkedAgents: ['Atendente Virtual'],
  },
  {
    id: '3',
    name: 'tabela-precos.docx',
    type: 'application/docx',
    size: 128000,
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1),
    linkedAgents: ['Vendas'],
  },
];

const DocumentsPage = () => {
  const [documents, setDocuments] = useState(mockDocuments);
  const [dragActive, setDragActive] = useState(false);
  const { toast } = useToast();

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
      const files = Array.from(e.dataTransfer.files);
      handleUpload(files);
    }
  };

  const handleUpload = (files: File[]) => {
    const newDocs: Document[] = files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date(),
      linkedAgents: [],
    }));
    
    setDocuments(prev => [...newDocs, ...prev]);
    toast({
      title: 'Upload concluído!',
      description: `${files.length} arquivo(s) enviado(s) com sucesso.`,
    });
  };

  const handleDelete = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    toast({
      title: 'Documento excluído',
      description: 'O documento foi removido com sucesso.',
      variant: 'destructive',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return FileType;
    return File;
  };

  return (
    <MainLayout>
      <Header 
        title="Documentos" 
        subtitle="Gerencie documentos de contexto para seus agentes"
      />

      {/* Upload Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-8 border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : 'border-border glass-card'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Arraste arquivos aqui
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          ou clique para selecionar arquivos do seu computador
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          PDF, TXT, DOCX até 10MB cada
        </p>
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.docx"
          onChange={(e) => e.target.files && handleUpload(Array.from(e.target.files))}
          className="hidden"
          id="file-upload"
        />
        <Button
          variant="outline"
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          Selecionar Arquivos
        </Button>
      </motion.div>

      {/* Documents List */}
      <div className="space-y-3">
        {documents.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum documento enviado ainda</p>
          </div>
        ) : (
          documents.map((doc, index) => {
            const FileIcon = getFileIcon(doc.type);
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass-card-hover p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{doc.name}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatSize(doc.size)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(doc.uploadedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex gap-1">
                    {doc.linkedAgents.map((agent, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {agent}
                      </Badge>
                    ))}
                    {doc.linkedAgents.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        Sem agentes vinculados
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(doc.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </MainLayout>
  );
};

export default DocumentsPage;
