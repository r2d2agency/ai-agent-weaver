import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Save, Power, Trash2, Loader2, MessageSquare, Wifi, WifiOff, CheckCircle, XCircle, TestTube, Mic, Globe, Copy, Check, FileText, History, Ghost, UserCheck, Clock, Timer } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAgent, useUpdateAgent, useDeleteAgent } from '@/hooks/use-agents';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';
import { TestAgentModal } from '@/components/agents/TestAgentModal';
import { AgentDocumentsModal } from '@/components/agents/AgentDocumentsModal';
import { AgentConversationsModal } from '@/components/agents/AgentConversationsModal';

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
    instanceName: '',
    webhookUrl: '',
    token: '',
    audioEnabled: true,
    widgetEnabled: false,
    ghostMode: false,
    takeoverTimeout: 60,
    inactivityEnabled: false,
    inactivityTimeout: 5,
    inactivityMessage: 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋',
  });

  const [testingInstance, setTestingInstance] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error'>('idle');
  const [testAgentModalOpen, setTestAgentModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [conversationsModalOpen, setConversationsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (agentData) {
      setFormData({
        name: agentData.name || '',
        description: agentData.description || '',
        prompt: agentData.prompt || '',
        instanceName: agentData.instance_name || '',
        webhookUrl: agentData.webhook_url || '',
        token: agentData.token || '',
        audioEnabled: agentData.audio_enabled !== false,
        widgetEnabled: agentData.widget_enabled === true,
        ghostMode: agentData.ghost_mode === true,
        takeoverTimeout: agentData.takeover_timeout || 60,
        inactivityEnabled: agentData.inactivity_enabled === true,
        inactivityTimeout: agentData.inactivity_timeout || 5,
        inactivityMessage: agentData.inactivity_message || 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋',
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
        instanceName: formData.instanceName,
        webhookUrl: formData.webhookUrl,
        token: formData.token,
      },
    });
  };

  const handleToggleAudio = (enabled: boolean) => {
    if (!id) return;
    setFormData(prev => ({ ...prev, audioEnabled: enabled }));
    updateAgentMutation.mutate({
      id,
      data: { audioEnabled: enabled } as any,
    });
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

  const handleTestInstance = async () => {
    if (!formData.instanceName) {
      toast({
        title: 'Nome da instância necessário',
        description: 'Informe o nome da instância para testar.',
        variant: 'destructive',
      });
      return;
    }

    setTestingInstance(true);
    setInstanceStatus('idle');

    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/test-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: formData.instanceName }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.connected) {
          setInstanceStatus('connected');
          toast({
            title: 'Instância conectada!',
            description: `A instância "${formData.instanceName}" está online e pronta.`,
          });
        } else {
          setInstanceStatus('disconnected');
          toast({
            title: 'Instância desconectada',
            description: `A instância existe mas não está conectada ao WhatsApp. Estado: ${data.state}`,
            variant: 'destructive',
          });
        }
      } else {
        setInstanceStatus('error');
        toast({
          title: 'Erro ao testar instância',
          description: data.error || 'Verifique as configurações da Evolution API.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setInstanceStatus('error');
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar à Evolution API.',
        variant: 'destructive',
      });
    } finally {
      setTestingInstance(false);
    }
  };

  const getInstanceStatusIcon = () => {
    if (instanceStatus === 'connected') return <CheckCircle className="w-4 h-4 text-success" />;
    if (instanceStatus === 'disconnected') return <WifiOff className="w-4 h-4 text-warning" />;
    if (instanceStatus === 'error') return <XCircle className="w-4 h-4 text-destructive" />;
    return null;
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
              <div className="grid grid-cols-2 gap-4">
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
                  <Label htmlFor="instanceName" className="flex items-center gap-2">
                    Nome da Instância
                    {getInstanceStatusIcon()}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="instanceName"
                      value={formData.instanceName}
                      onChange={(e) => setFormData(prev => ({ ...prev, instanceName: e.target.value }))}
                      className="bg-muted border-border"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleTestInstance}
                      disabled={testingInstance}
                      title="Testar conexão da instância"
                    >
                      {testingInstance ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wifi className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookUrl">URL do Webhook</Label>
                  <Input
                    id="webhookUrl"
                    value={formData.webhookUrl}
                    onChange={(e) => setFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                    className="bg-muted border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token">Token</Label>
                  <Input
                    id="token"
                    type="password"
                    value={formData.token}
                    onChange={(e) => setFormData(prev => ({ ...prev, token: e.target.value }))}
                    className="bg-muted border-border"
                  />
                </div>
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
              <div className="space-y-2">
                <Label className="text-xs">Código de Incorporação</Label>
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

      <AgentConversationsModal
        open={conversationsModalOpen}
        onOpenChange={setConversationsModalOpen}
        agent={agentData ? { id: agentData.id, name: agentData.name } : null}
      />
    </MainLayout>
  );
};

export default AgentDetailsPage;
