import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Image, 
  Images, 
  Video, 
  Upload, 
  Trash2, 
  X, 
  Loader2,
  Plus,
  FileImage,
  Play,
  FileText,
  File
} from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface MediaItem {
  id: string;
  agent_id: string;
  media_type: 'image' | 'gallery' | 'video' | 'document';
  name: string;
  description: string;
  file_urls: string[];
  file_sizes: number[];
  mime_types: string[];
  created_at: string;
}

interface AgentMediaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: {
    id: string;
    name: string;
  } | null;
}

interface FileData {
  base64: string;
  mimeType: string;
  size: number;
  preview: string;
}

export function AgentMediaModal({ open, onOpenChange, agent }: AgentMediaModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<'image' | 'gallery' | 'video' | 'document'>('image');
  const [isUploading, setIsUploading] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileData[]>([]);

  const { data: mediaItems = [], isLoading } = useQuery({
    queryKey: ['media', agent?.id],
    queryFn: async () => {
      if (!agent?.id) return [];
      const response = await fetch(`${API_BASE_URL}/api/media/agent/${agent.id}`);
      if (!response.ok) throw new Error('Failed to fetch media');
      return response.json();
    },
    enabled: !!agent?.id && open,
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { mediaType: string; name: string; description: string; files: FileData[] }) => {
      const response = await fetch(`${API_BASE_URL}/api/media/agent/${agent?.id}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: data.mediaType,
          name: data.name,
          description: data.description,
          files: data.files.map(f => ({ base64: f.base64, mimeType: f.mimeType, size: f.size })),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', agent?.id] });
      toast({ title: 'Mídia adicionada!', description: 'A mídia foi salva com sucesso.' });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_BASE_URL}/api/media/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media', agent?.id] });
      toast({ title: 'Mídia excluída', description: 'A mídia foi removida.' });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setFiles([]);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (documentInputRef.current) documentInputRef.current.value = '';
  };

  const handleFileSelect = async (fileList: FileList, type: 'image' | 'gallery' | 'video' | 'document') => {
    const maxFiles = type === 'gallery' ? 4 : 1;
    const selectedFiles = Array.from(fileList).slice(0, maxFiles);
    
    setIsUploading(true);
    try {
      const fileDataArray: FileData[] = [];
      
      for (const file of selectedFiles) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const base64 = await base64Promise;
        
        fileDataArray.push({
          base64,
          mimeType: file.type,
          size: file.size,
          preview: URL.createObjectURL(file),
        });
      }
      
      if (type === 'gallery') {
        setFiles(prev => [...prev, ...fileDataArray].slice(0, 4));
      } else {
        setFiles(fileDataArray);
      }
    } catch (error) {
      toast({ title: 'Erro ao ler arquivo', variant: 'destructive' });
    }
    setIsUploading(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (!description.trim()) {
      toast({ title: 'Descrição obrigatória', description: 'A descrição é usada pelo agente para identificar quando enviar esta mídia.', variant: 'destructive' });
      return;
    }
    if (files.length === 0) {
      toast({ title: 'Selecione ao menos um arquivo', variant: 'destructive' });
      return;
    }
    
    uploadMutation.mutate({
      mediaType: activeTab,
      name: name.trim(),
      description: description.trim(),
      files,
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="w-4 h-4" />;
      case 'gallery': return <Images className="w-4 h-4" />;
      case 'video': return <Video className="w-4 h-4" />;
      case 'document': return <FileText className="w-4 h-4" />;
      default: return <FileImage className="w-4 h-4" />;
    }
  };

  const getMediaBadgeColor = (type: string) => {
    switch (type) {
      case 'image': return 'bg-blue-500/20 text-blue-400';
      case 'gallery': return 'bg-purple-500/20 text-purple-400';
      case 'video': return 'bg-green-500/20 text-green-400';
      case 'document': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getDocumentIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPT';
    return 'DOC';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="w-5 h-5 text-primary" />
            Galeria de Mídia: {agent?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Upload Section */}
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); resetForm(); }}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="image" className="flex items-center gap-1 text-xs">
                <Image className="w-3 h-3" />
                Foto
              </TabsTrigger>
              <TabsTrigger value="gallery" className="flex items-center gap-1 text-xs">
                <Images className="w-3 h-3" />
                Galeria
              </TabsTrigger>
              <TabsTrigger value="video" className="flex items-center gap-1 text-xs">
                <Video className="w-3 h-3" />
                Vídeo
              </TabsTrigger>
              <TabsTrigger value="document" className="flex items-center gap-1 text-xs">
                <FileText className="w-3 h-3" />
                Documento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="space-y-3 mt-4">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome do Produto</Label>
                    <Input
                      placeholder="Ex: Camiseta Azul M"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Foto</Label>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files, 'image')}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      {files.length > 0 ? 'Trocar foto' : 'Selecionar foto'}
                    </Button>
                  </div>
                </div>
                
                {files.length > 0 && (
                  <div className="relative w-24 h-24 rounded-lg overflow-hidden border">
                    <img src={files[0].preview} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(0)}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-1 hover:bg-black/70"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                )}
                
                <div>
                  <Label>Descrição para o Agente</Label>
                  <Textarea
                    placeholder="Descreva o produto para que o agente saiba quando enviar esta imagem. Ex: Camiseta azul masculina tamanho M, 100% algodão, R$ 79,90"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 min-h-[80px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="gallery" className="space-y-3 mt-4">
              <div className="grid gap-3">
                <div>
                  <Label>Nome da Galeria</Label>
                  <Input
                    placeholder="Ex: Coleção Verão 2025"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Fotos (até 4)</Label>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => e.target.files && handleFileSelect(e.target.files, 'gallery')}
                    className="hidden"
                  />
                  
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {files.map((file, index) => (
                      <div key={index} className="relative aspect-square rounded-lg overflow-hidden border">
                        <img src={file.preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeFile(index)}
                          className="absolute top-1 right-1 bg-black/50 rounded-full p-1 hover:bg-black/70"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                    {files.length < 4 && (
                      <button
                        onClick={() => galleryInputRef.current?.click()}
                        className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
                      >
                        <Plus className="w-6 h-6 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div>
                  <Label>Descrição para o Agente</Label>
                  <Textarea
                    placeholder="Descreva a galeria para que o agente saiba quando enviar. Ex: Fotos da coleção verão 2025, inclui vestidos, saias e blusas femininas"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 min-h-[80px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="video" className="space-y-3 mt-4">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome do Vídeo</Label>
                    <Input
                      placeholder="Ex: Tutorial de uso"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Vídeo</Label>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files, 'video')}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => videoInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      {files.length > 0 ? 'Trocar vídeo' : 'Selecionar vídeo'}
                    </Button>
                  </div>
                </div>
                
                {files.length > 0 && (
                  <div className="relative w-40 h-24 rounded-lg overflow-hidden border bg-black flex items-center justify-center">
                    <video src={files[0].preview} className="max-w-full max-h-full" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="w-8 h-8 text-white" />
                    </div>
                    <button
                      onClick={() => removeFile(0)}
                      className="absolute top-1 right-1 bg-black/50 rounded-full p-1 hover:bg-black/70"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                )}
                
                <div>
                  <Label>Descrição para o Agente</Label>
                  <Textarea
                    placeholder="Descreva o vídeo para que o agente saiba quando enviar. Ex: Vídeo tutorial mostrando como montar o produto, 2 minutos de duração"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 min-h-[80px]"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="document" className="space-y-3 mt-4">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome do Documento</Label>
                    <Input
                      placeholder="Ex: Apresentação Comercial"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Arquivo (PDF ou PowerPoint)</Label>
                    <input
                      ref={documentInputRef}
                      type="file"
                      accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files, 'document')}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => documentInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      {files.length > 0 ? 'Trocar documento' : 'Selecionar documento'}
                    </Button>
                  </div>
                </div>
                
                {files.length > 0 && (
                  <div className="relative flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                    <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getDocumentIcon(files[0].mimeType)}</p>
                      <p className="text-xs text-muted-foreground">{formatSize(files[0].size)}</p>
                    </div>
                    <button
                      onClick={() => removeFile(0)}
                      className="p-1.5 rounded-full hover:bg-muted"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                )}
                
                <div>
                  <Label>Descrição para o Agente</Label>
                  <Textarea
                    placeholder="Descreva o documento para que o agente saiba quando enviar. Ex: Apresentação comercial com catálogo de produtos e tabela de preços"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 min-h-[80px]"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Button
            onClick={handleSubmit}
            disabled={uploadMutation.isPending || files.length === 0}
            className="btn-primary-gradient"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Salvar Mídia
          </Button>

          {/* Media List */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-3 text-sm text-muted-foreground">Mídias Cadastradas</h3>
            <ScrollArea className="h-[200px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : mediaItems.length === 0 ? (
                <div className="text-center py-8">
                  <Images className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhuma mídia cadastrada</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adicione fotos e vídeos dos seus produtos
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {mediaItems.map((item: MediaItem) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {/* Preview */}
                          <div className="w-12 h-12 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {item.media_type === 'video' ? (
                              <div className="relative w-full h-full bg-black flex items-center justify-center">
                                <Play className="w-4 h-4 text-white" />
                              </div>
                            ) : item.file_urls[0]?.startsWith('data:') ? (
                              <img src={item.file_urls[0]} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              getMediaIcon(item.media_type)
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{item.name}</p>
                              <Badge className={`text-xs ${getMediaBadgeColor(item.media_type)}`}>
                                {item.media_type === 'image' && 'Foto'}
                                {item.media_type === 'gallery' && `Galeria (${item.file_urls.length})`}
                                {item.media_type === 'video' && 'Vídeo'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(item.id)}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
