import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Save, Power, Trash2, Loader2, MessageSquare, Wifi, WifiOff, CheckCircle, XCircle, TestTube, Mic, Globe, Copy, Check } from 'lucide-react';
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
  });

  const [testingInstance, setTestingInstance] = useState(false);
  const [instanceStatus, setInstanceStatus] = useState<'idle' | 'connected' | 'disconnected' | 'error'>('idle');
  const [testAgentModalOpen, setTestAgentModalOpen] = useState(false);
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

          {/* Audio Processing Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17 }}
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
    </MainLayout>
  );
};

export default AgentDetailsPage;
