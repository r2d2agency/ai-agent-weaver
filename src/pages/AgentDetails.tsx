import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Save, Power, Trash2, Loader2, MessageSquare, Wifi, WifiOff, CheckCircle, XCircle, TestTube, Mic, Globe, Copy, Check, FileText, History, Ghost, UserCheck, Clock, Timer, CalendarClock, Image, Images, File, Key, Link2, Upload, Palette, Video, HelpCircle, Volume2, Play, Square, Bell, Phone, ClipboardList, Package } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAgent, useUpdateAgent, useDeleteAgent } from '@/hooks/use-agents';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, testAgentEvolution, previewVoice } from '@/lib/api';
import { TestAgentModal } from '@/components/agents/TestAgentModal';
import { AgentDocumentsModal } from '@/components/agents/AgentDocumentsModal';
import { AgentMediaModal } from '@/components/agents/AgentMediaModal';
import { AgentConversationsModal } from '@/components/agents/AgentConversationsModal';
import { AgentFaqModal } from '@/components/agents/AgentFaqModal';
import { AgentProductsModal } from '@/components/agents/AgentProductsModal';
import { RequiredFieldsManager, RequiredField } from '@/components/agents/RequiredFieldsManager';

const AgentDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: agentData, isLoading, error } = useAgent(id || '');
  const updateAgentMutation = useUpdateAgent();
  const deleteAgentMutation = useDeleteAgent();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: '',
    evolutionApiUrl: '',
    evolutionApiKey: '',
    instanceName: '',
    webhookUrl: '',
    token: '',
    audioEnabled: true,
    imageEnabled: true,
    documentEnabled: true,
    widgetEnabled: false,
    widgetAvatarUrl: '',
    widgetPosition: 'right',
    widgetTitle: 'Assistente',
    widgetPrimaryColor: '#667eea',
    widgetSecondaryColor: '#764ba2',
    widgetBackgroundColor: '#ffffff',
    widgetTextColor: '#333333',
    widgetTrainingMode: false,
    widgetResetCode: '',
    ghostMode: false,
    takeoverTimeout: 60,
    inactivityEnabled: false,
    inactivityTimeout: 5,
    inactivityMessage: 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋',
    operatingHoursEnabled: false,
    operatingHoursStart: '09:00',
    operatingHoursEnd: '18:00',
    outOfHoursMessage: 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    audioResponseEnabled: false,
    audioResponseVoice: 'nova',
    notificationNumber: '',
    transferInstructions: '',
    requiredFields: [] as RequiredField[],
  });

  const [testingEvolution, setTestingEvolution] = useState(false);
  const [evolutionStatus, setEvolutionStatus] = useState<'idle' | 'connected' | 'api_only' | 'disconnected' | 'error'>('idle');
  const [testAgentModalOpen, setTestAgentModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [conversationsModalOpen, setConversationsModalOpen] = useState(false);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [productsModalOpen, setProductsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-generate webhook URL based on instance name
  const generatedWebhookUrl = formData.instanceName 
    ? `${API_BASE_URL}/api/webhook/${formData.instanceName}`
    : '';

  useEffect(() => {
    if (agentData) {
      setFormData({
        name: agentData.name || '',
        description: agentData.description || '',
        prompt: agentData.prompt || '',
        evolutionApiUrl: agentData.evolution_api_url || '',
        evolutionApiKey: agentData.evolution_api_key || '',
        instanceName: agentData.instance_name || '',
        webhookUrl: agentData.webhook_url || '',
        token: agentData.token || '',
        audioEnabled: agentData.audio_enabled !== false,
        imageEnabled: agentData.image_enabled !== false,
        documentEnabled: agentData.document_enabled !== false,
        widgetEnabled: agentData.widget_enabled === true,
        widgetAvatarUrl: agentData.widget_avatar_url || '',
        widgetPosition: agentData.widget_position || 'right',
        widgetTitle: agentData.widget_title || 'Assistente',
        widgetPrimaryColor: agentData.widget_primary_color || '#667eea',
        widgetSecondaryColor: agentData.widget_secondary_color || '#764ba2',
        widgetBackgroundColor: agentData.widget_background_color || '#ffffff',
        widgetTextColor: agentData.widget_text_color || '#333333',
        widgetTrainingMode: agentData.widget_training_mode === true,
        widgetResetCode: agentData.widget_reset_code || '',
        ghostMode: agentData.ghost_mode === true,
        takeoverTimeout: agentData.takeover_timeout || 60,
        inactivityEnabled: agentData.inactivity_enabled === true,
        inactivityTimeout: agentData.inactivity_timeout || 5,
        inactivityMessage: agentData.inactivity_message || 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋',
        operatingHoursEnabled: agentData.operating_hours_enabled === true,
        operatingHoursStart: agentData.operating_hours_start || '09:00',
        operatingHoursEnd: agentData.operating_hours_end || '18:00',
        outOfHoursMessage: agentData.out_of_hours_message || 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐',
        openaiApiKey: agentData.openai_api_key || '',
        openaiModel: agentData.openai_model || 'gpt-4o',
        audioResponseEnabled: agentData.audio_response_enabled === true,
        audioResponseVoice: agentData.audio_response_voice || 'nova',
        notificationNumber: agentData.notification_number || '',
        transferInstructions: agentData.transfer_instructions || '',
        requiredFields: agentData.required_fields || [],
      });
    }
  }, [agentData]);

  const handleSave = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: {
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        evolutionApiUrl: formData.evolutionApiUrl,
        evolutionApiKey: formData.evolutionApiKey,
        instanceName: formData.instanceName,
        webhookUrl: generatedWebhookUrl,
        token: formData.token,
      } as any,
    });
  };

  const handleSaveEvolution = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: {
        evolutionApiUrl: formData.evolutionApiUrl,
        evolutionApiKey: formData.evolutionApiKey,
        instanceName: formData.instanceName,
        webhookUrl: generatedWebhookUrl,
      } as any,
    });
  };

  const copyWebhookUrl = () => {
    if (generatedWebhookUrl) {
      navigator.clipboard.writeText(generatedWebhookUrl);
      setWebhookCopied(true);
      toast({
        title: 'Webhook copiado!',
        description: 'Cole essa URL nas configurações da instância no Evolution.',
      });
      setTimeout(() => setWebhookCopied(false), 2000);
    }
  };

  const handleTestEvolution = async () => {
    if (!formData.evolutionApiUrl || !formData.evolutionApiKey) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe a URL e API Key da Evolution para testar.',
        variant: 'destructive',
      });
      return;
    }

    setTestingEvolution(true);
    setEvolutionStatus('idle');

    try {
      const data = await testAgentEvolution(id || '', {
        evolutionApiUrl: formData.evolutionApiUrl,
        evolutionApiKey: formData.evolutionApiKey,
        instanceName: formData.instanceName,
      });

      if (data.success) {
        if (data.connected) {
          setEvolutionStatus('connected');
          toast({
            title: 'Conexão estabelecida!',
            description: data.message || 'Evolution API e instância conectados.',
          });
        } else if (formData.instanceName) {
          setEvolutionStatus('api_only');
          toast({
            title: 'API conectada',
            description: data.error || data.message || 'Instância não está conectada ao WhatsApp.',
            variant: 'destructive',
          });
        } else {
          setEvolutionStatus('api_only');
          toast({
            title: 'API conectada!',
            description: 'Agora informe o nome da instância.',
          });
        }
      } else {
        setEvolutionStatus('error');
        toast({
          title: 'Erro na conexão',
          description: data.error || 'Verifique a URL e API Key.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setEvolutionStatus('error');
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar à Evolution API.',
        variant: 'destructive',
      });
    } finally {
      setTestingEvolution(false);
    }
  };

  const getEvolutionStatusIcon = () => {
    if (evolutionStatus === 'connected') return <CheckCircle className="w-4 h-4 text-success" />;
    if (evolutionStatus === 'api_only') return <Wifi className="w-4 h-4 text-warning" />;
    if (evolutionStatus === 'disconnected') return <WifiOff className="w-4 h-4 text-warning" />;
    if (evolutionStatus === 'error') return <XCircle className="w-4 h-4 text-destructive" />;
    return null;
  };

  const handleToggleAudio = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, audioEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { audioEnabled: enabled } as any,
    });
  };

  const handleToggleImage = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, imageEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { imageEnabled: enabled } as any,
    });
  };

  const handleToggleDocument = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, documentEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { documentEnabled: enabled } as any,
    });
  };

  const handleOpenAISettingsChange = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: { 
        openaiApiKey: formData.openaiApiKey || null,
        openaiModel: formData.openaiModel,
      } as any,
    });
  };

  const handleToggleAudioResponse = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, audioResponseEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { audioResponseEnabled: enabled } as any,
    });
  };

  const handleAudioResponseVoiceChange = (voice: string) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, audioResponseVoice: voice }));
    updateAgentMutation.mutate({
      id,
      data: { audioResponseVoice: voice } as any,
    });
  };

  const handleNotificationNumberChange = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: { notificationNumber: formData.notificationNumber || null } as any,
    });
  };

  const handleTransferInstructionsChange = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: { transferInstructions: formData.transferInstructions || null } as any,
    });
  };

  const handleRequiredFieldsChange = (fields: RequiredField[]) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, requiredFields: fields }));
    updateAgentMutation.mutate({
      id,
      data: { requiredFields: fields } as any,
    });
  };

  const handlePreviewVoice = async (voice: string) => {
    // If same voice is playing, stop it
    if (playingVoice === voice && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlayingVoice(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setLoadingVoice(voice);
    try {
      const result = await previewVoice(voice, id);
      
      if (result.success && result.audio) {
        const audioUrl = `data:${result.mimeType};base64,${result.audio}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        
        audio.onended = () => {
          setPlayingVoice(null);
        };
        
        audio.onerror = () => {
          setPlayingVoice(null);
          toast({
            title: 'Erro ao reproduzir',
            description: 'Não foi possível reproduzir o áudio.',
            variant: 'destructive',
          });
        };
        
        await audio.play();
        setPlayingVoice(voice);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar preview',
        description: error.message || 'Verifique se a API Key da OpenAI está configurada.',
        variant: 'destructive',
      });
    } finally {
      setLoadingVoice(null);
    }
  };

  const handleToggleWidget = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, widgetEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { widgetEnabled: enabled } as any,
    });
  };

  const handleToggleGhostMode = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, ghostMode: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { ghostMode: enabled } as any,
    });
  };

  const handleTakeoverTimeoutChange = (value: number) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, takeoverTimeout: value }));
    updateAgentMutation.mutate({
      id,
      data: { takeoverTimeout: value } as any,
    });
  };

  const handleToggleInactivity = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, inactivityEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { inactivityEnabled: enabled } as any,
    });
  };

  const handleInactivitySettingsChange = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: { 
        inactivityTimeout: formData.inactivityTimeout,
        inactivityMessage: formData.inactivityMessage,
      } as any,
    });
  };

  const handleToggleOperatingHours = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, operatingHoursEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { operatingHoursEnabled: enabled } as any,
    });
  };

  const handleOperatingHoursSettingsChange = () => {
    if (!id) return;
    updateAgentMutation.mutate({
      id,
      data: { 
        operatingHoursStart: formData.operatingHoursStart,
        operatingHoursEnd: formData.operatingHoursEnd,
        outOfHoursMessage: formData.outOfHoursMessage,
      } as any,
    });
  };

  const copyEmbedCode = () => {
    const embedCode = `<script src="${API_BASE_URL}/api/widget/embed/${id}"></script>`;
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({
      title: 'Código copiado!',
      description: 'Cole o código no HTML do seu site.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = () => {
    if (!id || !agentData) return;
    updateAgentMutation.mutate({
      id,
      data: { status: agentData.status === 'online' ? 'offline' : 'online' },
    });
  };

  const handleDelete = () => {
    if (!id) return;
    deleteAgentMutation.mutate(id, {
      onSuccess: () => navigate('/agents'),
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (error || !agentData) {
    return (
      <MainLayout>
        <Header title="Agente não encontrado" />
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground mb-4">O agente solicitado não foi encontrado.</p>
          <Button onClick={() => navigate('/agents')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Agentes
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate('/agents')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Header 
          title={agentData.name} 
          subtitle={`Instância: ${agentData.instance_name}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Configurações do Agente
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Agente</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt do Sistema</Label>
                <Textarea
                  id="prompt"
                  value={formData.prompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                  className="bg-muted border-border min-h-[150px]"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button 
                className="btn-primary-gradient" 
                onClick={handleSave}
                disabled={updateAgentMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {updateAgentMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </motion.div>

          {/* Evolution API Configuration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-card p-6"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              Conexão Evolution API
              {getEvolutionStatusIcon()}
            </h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="evolutionApiUrl">URL da Evolution API</Label>
                <Input
                  id="evolutionApiUrl"
                  placeholder="https://sua-evolution-api.com"
                  value={formData.evolutionApiUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, evolutionApiUrl: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="evolutionApiKey">API Key da Evolution</Label>
                <Input
                  id="evolutionApiKey"
                  type="password"
                  placeholder="Sua API Key"
                  value={formData.evolutionApiKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instanceName">Nome da Instância</Label>
                <Input
                  id="instanceName"
                  placeholder="minha-instancia"
                  value={formData.instanceName}
                  onChange={(e) => setFormData(prev => ({ ...prev, instanceName: e.target.value }))}
                  className="bg-muted border-border"
                />
              </div>

              {/* Auto-generated Webhook URL */}
              {generatedWebhookUrl && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    Webhook URL
                    <span className="text-xs text-muted-foreground">(gerado automaticamente)</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={generatedWebhookUrl}
                      className="bg-muted border-border font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyWebhookUrl}
                      title="Copiar URL do Webhook"
                    >
                      {webhookCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cole esta URL nas configurações da instância na Evolution API.
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={handleTestEvolution}
                  disabled={testingEvolution}
                  className="flex-1"
                >
                  {testingEvolution ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Wifi className="w-4 h-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>
                <Button
                  onClick={handleSaveEvolution}
                  disabled={updateAgentMutation.isPending}
                  className="flex-1 btn-primary-gradient"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Evolution
                </Button>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Status</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full ${agentData.status === 'online' ? 'bg-success' : 'bg-muted-foreground'}`} />
              <span className="capitalize">{agentData.status || 'offline'}</span>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleToggleStatus}
              disabled={updateAgentMutation.isPending}
            >
              <Power className="w-4 h-4 mr-2" />
              {agentData.status === 'online' ? 'Desativar' : 'Ativar'}
            </Button>
          </motion.div>

          {/* Test Agent Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Testar Agente</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Simule uma conversa com este agente usando a IA configurada.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setTestAgentModalOpen(true)}
            >
              <TestTube className="w-4 h-4 mr-2" />
              Abrir Chat de Teste
            </Button>
          </motion.div>

          {/* Documents Card - RAG */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Base de Conhecimento
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Documentos que o agente usa para responder (RAG).
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setDocumentsModalOpen(true)}
            >
              <FileText className="w-4 h-4 mr-2" />
              Gerenciar Documentos
            </Button>
          </motion.div>

          {/* Media Gallery Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.162 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Images className="w-4 h-4 text-primary" />
              Galeria de Mídia
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Fotos e vídeos que o agente pode enviar.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setMediaModalOpen(true)}
            >
              <Images className="w-4 h-4 mr-2" />
              Gerenciar Mídia
            </Button>
          </motion.div>

          {/* Conversations Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.165 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico de Conversas
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Visualize todas as conversas deste agente.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setConversationsModalOpen(true)}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Ver Conversas
            </Button>
          </motion.div>

          {/* FAQ Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.167 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              Perguntas Frequentes
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Respostas automáticas sem usar a API.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setFaqModalOpen(true)}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Gerenciar FAQs
            </Button>
          </motion.div>

          {/* Products Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.165 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Catálogo de Produtos
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Produtos com preços para a IA consultar e calcular pedidos.
            </p>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setProductsModalOpen(true)}
            >
              <Package className="w-4 h-4 mr-2" />
              Gerenciar Produtos
            </Button>
          </motion.div>

          {/* Ghost Mode Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Ghost className="w-4 h-4 text-primary" />
                Modo Fantasma
              </h3>
              <Switch
                checked={formData.ghostMode}
                onCheckedChange={handleToggleGhostMode}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              O agente armazena as conversas mas não responde. Útil para coletar histórico antes de ativar.
            </p>
          </motion.div>

          {/* Takeover Timeout Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.175 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">Takeover (Assumir Controle)</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Quando você responde pelo WhatsApp, o agente pausa por este tempo.
            </p>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min={10}
                max={3600}
                value={formData.takeoverTimeout}
                onChange={(e) => setFormData(prev => ({ ...prev, takeoverTimeout: parseInt(e.target.value) || 60 }))}
                onBlur={() => handleTakeoverTimeoutChange(formData.takeoverTimeout)}
                className="w-24 bg-muted border-border"
              />
              <span className="text-sm text-muted-foreground">segundos</span>
            </div>
          </motion.div>

          {/* Human Notification Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.176 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground">Notificação para Humano</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Configure como a IA deve transferir atendimentos para um humano.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Número do WhatsApp</Label>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="5511999999999"
                    value={formData.notificationNumber}
                    onChange={(e) => setFormData(prev => ({ ...prev, notificationNumber: e.target.value }))}
                    onBlur={handleNotificationNumberChange}
                    className="flex-1 bg-muted border-border"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Formato: código do país + DDD + número (ex: 5511999999999)
                </p>
              </div>
              
              {formData.notificationNumber && (
                <div className="space-y-2">
                  <Label className="text-xs">Instruções de Transferência</Label>
                  <Textarea
                    placeholder={`Exemplos de instruções:
• Ao transferir pedido, incluir: nome do cliente, produtos, quantidades, valores, endereço de entrega, forma de pagamento
• Ao transferir dúvida, incluir: assunto principal, tentativas de resolução já feitas
• Ao transferir reclamação, incluir: motivo, histórico completo, nível de urgência`}
                    value={formData.transferInstructions}
                    onChange={(e) => setFormData(prev => ({ ...prev, transferInstructions: e.target.value }))}
                    onBlur={handleTransferInstructionsChange}
                    className="bg-muted border-border min-h-[120px] text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Defina quais informações a IA deve coletar e enviar ao atendente humano. 
                    Seja específico sobre os dados importantes para seu negócio.
                  </p>
                </div>
              )}

              {formData.notificationNumber && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-medium">Variáveis Obrigatórias</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure quais informações a IA deve coletar obrigatoriamente antes de transferir.
                    Se alguma estiver faltando, a IA perguntará ao cliente antes de transferir.
                  </p>
                  <RequiredFieldsManager
                    fields={formData.requiredFields}
                    onChange={handleRequiredFieldsChange}
                  />
                </div>
              )}
            </div>
          </motion.div>

          {/* Inactivity Timeout Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.177 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Timer className="w-4 h-4 text-primary" />
                Timeout de Inatividade
              </h3>
              <Switch
                checked={formData.inactivityEnabled}
                onCheckedChange={handleToggleInactivity}
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Envia uma mensagem de encerramento se o usuário parar de responder.
            </p>
            {formData.inactivityEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={formData.inactivityTimeout}
                    onChange={(e) => setFormData(prev => ({ ...prev, inactivityTimeout: parseInt(e.target.value) || 5 }))}
                    onBlur={handleInactivitySettingsChange}
                    className="w-20 bg-muted border-border"
                  />
                  <span className="text-sm text-muted-foreground">minutos</span>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem de encerramento</Label>
                  <Textarea
                    value={formData.inactivityMessage}
                    onChange={(e) => setFormData(prev => ({ ...prev, inactivityMessage: e.target.value }))}
                    onBlur={handleInactivitySettingsChange}
                    className="bg-muted border-border min-h-[60px] text-sm"
                    placeholder="Mensagem enviada quando o usuário não responde..."
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Operating Hours Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.179 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                Horário de Funcionamento
              </h3>
              <Switch
                checked={formData.operatingHoursEnabled}
                onCheckedChange={handleToggleOperatingHours}
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Define quando o agente responde normalmente. Fora do horário, envia mensagem automática.
            </p>
            {formData.operatingHoursEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-xs w-12">Início</Label>
                  <Input
                    type="time"
                    value={formData.operatingHoursStart}
                    onChange={(e) => setFormData(prev => ({ ...prev, operatingHoursStart: e.target.value }))}
                    onBlur={handleOperatingHoursSettingsChange}
                    className="w-28 bg-muted border-border"
                  />
                  <Label className="text-xs w-8">Fim</Label>
                  <Input
                    type="time"
                    value={formData.operatingHoursEnd}
                    onChange={(e) => setFormData(prev => ({ ...prev, operatingHoursEnd: e.target.value }))}
                    onBlur={handleOperatingHoursSettingsChange}
                    className="w-28 bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Mensagem fora do horário</Label>
                  <Textarea
                    value={formData.outOfHoursMessage}
                    onChange={(e) => setFormData(prev => ({ ...prev, outOfHoursMessage: e.target.value }))}
                    onBlur={handleOperatingHoursSettingsChange}
                    className="bg-muted border-border min-h-[60px] text-sm"
                    placeholder="Mensagem enviada fora do horário de funcionamento..."
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Audio Processing Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />
                Processar Áudio
              </h3>
              <Switch
                checked={formData.audioEnabled}
                onCheckedChange={handleToggleAudio}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Transcreve mensagens de áudio do WhatsApp automaticamente usando IA.
            </p>
          </motion.div>

          {/* Audio Response Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.182 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-primary" />
                Responder em Áudio
              </h3>
              <Switch
                checked={formData.audioResponseEnabled}
                onCheckedChange={handleToggleAudioResponse}
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Quando o cliente enviar áudio, o agente responde em áudio. Mensagens de texto continuam como texto.
            </p>
            {formData.audioResponseEnabled && (
              <div className="space-y-3">
                <Label className="text-xs">Selecione a Voz (clique no 🔊 para ouvir)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'nova', label: 'Nova', emoji: '👩', desc: 'Feminina suave' },
                    { id: 'shimmer', label: 'Shimmer', emoji: '👩‍💼', desc: 'Feminina expressiva' },
                    { id: 'alloy', label: 'Alloy', emoji: '🧑', desc: 'Neutra' },
                    { id: 'onyx', label: 'Onyx', emoji: '👨', desc: 'Masculina grave' },
                    { id: 'echo', label: 'Echo', emoji: '👨‍💼', desc: 'Masculina média' },
                    { id: 'fable', label: 'Fable', emoji: '🎭', desc: 'Expressiva/Narradora' },
                  ].map((voice) => (
                    <div
                      key={voice.id}
                      className={`relative p-3 rounded-lg border transition-all ${
                        formData.audioResponseVoice === voice.id 
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                          : 'border-border bg-muted hover:border-primary/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleAudioResponseVoiceChange(voice.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{voice.emoji}</span>
                          <span className="text-sm font-medium">{voice.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{voice.desc}</p>
                      </button>
                      
                      {/* Preview button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewVoice(voice.id);
                        }}
                        disabled={loadingVoice === voice.id}
                        className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
                          playingVoice === voice.id 
                            ? 'bg-primary text-primary-foreground' 
                            : 'bg-muted-foreground/10 hover:bg-muted-foreground/20 text-muted-foreground'
                        }`}
                        title={playingVoice === voice.id ? 'Parar' : 'Ouvir preview'}
                      >
                        {loadingVoice === voice.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : playingVoice === voice.id ? (
                          <Square className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  🎧 Clique no ▶️ de cada voz para ouvir um sample antes de selecionar.
                </p>
              </div>
            )}
          </motion.div>

          {/* Image Processing Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.185 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" />
                Processar Imagens
              </h3>
              <Switch
                checked={formData.imageEnabled}
                onCheckedChange={handleToggleImage}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Analisa imagens recebidas usando GPT-4 Vision.
            </p>
          </motion.div>

          {/* Document Processing Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.187 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <File className="w-4 h-4 text-primary" />
                Processar Documentos
              </h3>
              <Switch
                checked={formData.documentEnabled}
                onCheckedChange={handleToggleDocument}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Analisa PDFs e documentos recebidos.
            </p>
          </motion.div>

          {/* OpenAI API Key Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.188 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              OpenAI deste Agente
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure uma API key exclusiva para rastrear o consumo deste agente.
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">API Key (opcional)</Label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={formData.openaiApiKey}
                  onChange={(e) => setFormData(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                  onBlur={handleOpenAISettingsChange}
                  className="bg-muted border-border text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Modelo</Label>
                <select
                  value={formData.openaiModel}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, openaiModel: e.target.value }));
                    if (id) {
                      updateAgentMutation.mutate({
                        id,
                        data: { openaiModel: e.target.value } as any,
                      });
                    }
                  }}
                  className="w-full h-10 px-3 rounded-md bg-muted border border-border text-sm"
                >
                  <option value="gpt-4o">GPT-4o (recomendado)</option>
                  <option value="gpt-4o-mini">GPT-4o Mini (mais barato)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Se vazio, usa a API key global configurada em Configurações.
              </p>
            </div>
          </motion.div>

          {/* Widget Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.19 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Widget para Site
              </h3>
              <Switch
                checked={formData.widgetEnabled}
                onCheckedChange={handleToggleWidget}
              />
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione este agente como um chat em seu site.
            </p>
            {formData.widgetEnabled && (
              <div className="space-y-4">
                {/* Avatar Upload */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Upload className="w-3 h-3" />
                    Avatar do Widget
                  </Label>
                  <div className="flex items-center gap-3">
                    {formData.widgetAvatarUrl ? (
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-muted border border-border">
                        <img 
                          src={formData.widgetAvatarUrl} 
                          alt="Avatar" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center">
                        <Bot className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const base64 = reader.result as string;
                              setFormData(prev => ({ ...prev, widgetAvatarUrl: base64 }));
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                  </div>
                  {formData.widgetAvatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive"
                      onClick={() => setFormData(prev => ({ ...prev, widgetAvatarUrl: '' }))}
                    >
                      Remover avatar
                    </Button>
                  )}
                </div>

                {/* Widget Title */}
                <div className="space-y-2">
                  <Label className="text-xs">Título do Chat</Label>
                  <Input
                    value={formData.widgetTitle}
                    onChange={(e) => setFormData(prev => ({ ...prev, widgetTitle: e.target.value }))}
                    placeholder="Assistente"
                    className="bg-muted border-border text-sm"
                  />
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <Label className="text-xs">Posição na Tela</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={formData.widgetPosition === 'left' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, widgetPosition: 'left' }))}
                      className="flex-1"
                    >
                      Esquerda
                    </Button>
                    <Button
                      variant={formData.widgetPosition === 'right' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormData(prev => ({ ...prev, widgetPosition: 'right' }))}
                      className="flex-1"
                    >
                      Direita
                    </Button>
                  </div>
                </div>

                {/* Colors */}
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-2">
                    <Palette className="w-3 h-3" />
                    Cores do Widget
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Cor Primária</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.widgetPrimaryColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetPrimaryColor: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.widgetPrimaryColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetPrimaryColor: e.target.value }))}
                          className="bg-muted border-border text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Cor Secundária</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.widgetSecondaryColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetSecondaryColor: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.widgetSecondaryColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetSecondaryColor: e.target.value }))}
                          className="bg-muted border-border text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Fundo</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.widgetBackgroundColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetBackgroundColor: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.widgetBackgroundColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetBackgroundColor: e.target.value }))}
                          className="bg-muted border-border text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Texto</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={formData.widgetTextColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetTextColor: e.target.value }))}
                          className="w-8 h-8 rounded cursor-pointer border-0"
                        />
                        <Input
                          value={formData.widgetTextColor}
                          onChange={(e) => setFormData(prev => ({ ...prev, widgetTextColor: e.target.value }))}
                          className="bg-muted border-border text-xs font-mono flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Training Mode */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold flex items-center gap-2">
                        🧪 Modo Treinamento
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        Exibe badge e botão de reset para testar o agente
                      </p>
                    </div>
                    <Switch
                      checked={formData.widgetTrainingMode}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, widgetTrainingMode: checked }))}
                    />
                  </div>
                  
                  {formData.widgetTrainingMode && (
                    <div className="space-y-2">
                      <Label className="text-xs">Código de Reset (opcional)</Label>
                      <Input
                        value={formData.widgetResetCode}
                        onChange={(e) => setFormData(prev => ({ ...prev, widgetResetCode: e.target.value }))}
                        placeholder="Ex: #reset123"
                        className="bg-muted border-border text-sm font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Se preenchido, usuários podem digitar este código no chat para resetar a conversa (além do botão).
                      </p>
                    </div>
                  )}
                </div>

                {/* Live Preview */}
                <div className="space-y-2 pt-4 border-t border-border">
                  <Label className="text-xs font-semibold">Preview ao Vivo</Label>
                  <div className="relative bg-muted/50 rounded-lg p-4 min-h-[280px] overflow-hidden">
                    {/* Mini chat container preview */}
                    <div 
                      className="absolute rounded-xl shadow-xl overflow-hidden"
                      style={{
                        width: '200px',
                        height: '240px',
                        right: formData.widgetPosition === 'right' ? '12px' : 'auto',
                        left: formData.widgetPosition === 'left' ? '12px' : 'auto',
                        bottom: '50px',
                        backgroundColor: formData.widgetBackgroundColor,
                      }}
                    >
                      {/* Header */}
                      <div 
                        className="p-3 flex items-center gap-2"
                        style={{
                          background: `linear-gradient(135deg, ${formData.widgetPrimaryColor} 0%, ${formData.widgetSecondaryColor} 100%)`,
                        }}
                      >
                        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                          {formData.widgetAvatarUrl ? (
                            <img src={formData.widgetAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <Bot className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-white text-xs font-semibold truncate">{formData.widgetTitle || 'Assistente'}</p>
                          <p className="text-white/70 text-[9px]">Online</p>
                        </div>
                      </div>
                      {/* Messages area */}
                      <div className="p-2 flex-1 bg-gray-100" style={{ height: '140px' }}>
                        <div 
                          className="text-[9px] p-2 rounded-lg rounded-bl-sm max-w-[80%] mb-1"
                          style={{ 
                            backgroundColor: formData.widgetBackgroundColor,
                            color: formData.widgetTextColor,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }}
                        >
                          Olá! Como posso ajudar?
                        </div>
                        <div 
                          className="text-[9px] p-2 rounded-lg rounded-br-sm max-w-[80%] ml-auto text-white"
                          style={{ 
                            background: `linear-gradient(135deg, ${formData.widgetPrimaryColor} 0%, ${formData.widgetSecondaryColor} 100%)`,
                          }}
                        >
                          Quero saber mais!
                        </div>
                      </div>
                      {/* Input area */}
                      <div className="p-2 border-t flex gap-1" style={{ backgroundColor: formData.widgetBackgroundColor }}>
                        <div className="flex-1 h-6 rounded-full bg-gray-100 border border-gray-200"></div>
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ 
                            background: `linear-gradient(135deg, ${formData.widgetPrimaryColor} 0%, ${formData.widgetSecondaryColor} 100%)`,
                          }}
                        >
                          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        </div>
                      </div>
                    </div>
                    
                    {/* Mini floating button preview */}
                    <div 
                      className="absolute w-10 h-10 rounded-full flex items-center justify-center shadow-lg overflow-hidden"
                      style={{
                        right: formData.widgetPosition === 'right' ? '12px' : 'auto',
                        left: formData.widgetPosition === 'left' ? '12px' : 'auto',
                        bottom: '8px',
                        background: `linear-gradient(135deg, ${formData.widgetPrimaryColor} 0%, ${formData.widgetSecondaryColor} 100%)`,
                      }}
                    >
                      {formData.widgetAvatarUrl ? (
                        <img src={formData.widgetAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <MessageSquare className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Save Widget Settings */}
                <Button
                  onClick={() => {
                    if (!id) return;
                    updateAgentMutation.mutate({
                      id,
                      data: {
                        widgetAvatarUrl: formData.widgetAvatarUrl,
                        widgetPosition: formData.widgetPosition,
                        widgetTitle: formData.widgetTitle,
                        widgetPrimaryColor: formData.widgetPrimaryColor,
                        widgetSecondaryColor: formData.widgetSecondaryColor,
                        widgetBackgroundColor: formData.widgetBackgroundColor,
                        widgetTextColor: formData.widgetTextColor,
                        widgetTrainingMode: formData.widgetTrainingMode,
                        widgetResetCode: formData.widgetResetCode,
                      } as any,
                    });
                  }}
                  disabled={updateAgentMutation.isPending}
                  className="w-full btn-primary-gradient"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Aparência
                </Button>

                {/* Embed Code */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <Label className="text-xs font-semibold">Código de Incorporação</Label>
                  <p className="text-xs text-muted-foreground">
                    Cole este código antes do fechamento da tag &lt;/body&gt; do seu site.
                  </p>
                  
                  {/* Basic embed */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Básico</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`<script src="${API_BASE_URL}/api/widget/embed/${id}"></script>`}
                        className="bg-muted border-border text-xs font-mono"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={copyEmbedCode}
                      >
                        {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Custom dimensions embed */}
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Com dimensões personalizadas</Label>
                    <div className="p-2 bg-muted rounded-md">
                      <code className="text-[10px] font-mono text-muted-foreground break-all">
                        {`<script src="${API_BASE_URL}/api/widget/embed/${id}" data-width="420" data-height="600"></script>`}
                      </code>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">data-width</code> e <code className="bg-muted px-1 rounded">data-height</code> para ajustar o tamanho.
                  </p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Stats Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-6"
          >
            <h3 className="font-semibold text-foreground mb-4">Estatísticas</h3>
            <div className="flex items-center gap-3 text-muted-foreground">
              <MessageSquare className="w-5 h-5" />
              <span>{agentData.messages_count || 0} mensagens</span>
            </div>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 border-destructive/20"
          >
            <h3 className="font-semibold text-destructive mb-4">Zona de Perigo</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Esta ação não pode ser desfeita.
            </p>
            <Button 
              variant="destructive" 
              className="w-full"
              onClick={handleDelete}
              disabled={deleteAgentMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteAgentMutation.isPending ? 'Excluindo...' : 'Excluir Agente'}
            </Button>
          </motion.div>
        </div>
      </div>

      <TestAgentModal
        open={testAgentModalOpen}
        onOpenChange={setTestAgentModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name, prompt: agentData.prompt } : null}
      />

      <AgentDocumentsModal
        open={documentsModalOpen}
        onOpenChange={setDocumentsModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name } : null}
      />

      <AgentMediaModal
        open={mediaModalOpen}
        onOpenChange={setMediaModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name } : null}
      />

      <AgentConversationsModal
        open={conversationsModalOpen}
        onOpenChange={setConversationsModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name } : null}
      />

      <AgentFaqModal
        open={faqModalOpen}
        onOpenChange={setFaqModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name } : null}
      />

      <AgentProductsModal
        open={productsModalOpen}
        onOpenChange={setProductsModalOpen}
        agentId={agentData?.id || ''}
        agentName={agentData?.name || ''}
      />
    </MainLayout>
  );
};

export default AgentDetailsPage;
