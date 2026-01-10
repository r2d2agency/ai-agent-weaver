import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Save, Eye, EyeOff, Key, Globe, Cpu, Database, CheckCircle, XCircle, Loader2, MessageSquare } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Settings } from '@/types/agent';
import { API_BASE_URL, getSettings, updateSettings } from '@/lib/api';
import { TestAgentModal } from '@/components/agents/TestAgentModal';
import { useAgents } from '@/hooks/use-agents';

const SettingsPage = () => {
  const { toast } = useToast();
  const { data: agents } = useAgents();
  const [showKeys, setShowKeys] = useState({
    openai: false,
    evolution: false,
  });
  
  const [settings, setSettings] = useState<Settings>({
    openaiApiKey: '',
    evolutionApiUrl: '',
    evolutionApiKey: '',
    defaultModel: 'gpt-4o-mini',
  });

  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const [testingEvolution, setTestingEvolution] = useState(false);
  const [openAIStatus, setOpenAIStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [evolutionStatus, setEvolutionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [testAgentModalOpen, setTestAgentModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getSettings();
        setSettings({
          openaiApiKey: data.openai_api_key || '',
          evolutionApiUrl: data.evolution_api_url || '',
          evolutionApiKey: data.evolution_api_key || '',
          defaultModel: data.default_model || 'gpt-4o-mini',
        });
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings({
        openai_api_key: settings.openaiApiKey,
        evolution_api_url: settings.evolutionApiUrl,
        evolution_api_key: settings.evolutionApiKey,
        default_model: settings.defaultModel,
      });
      toast({
        title: 'Configurações salvas!',
        description: 'Suas configurações foram atualizadas com sucesso.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestOpenAI = async () => {
    if (!settings.openaiApiKey) {
      toast({
        title: 'API Key necessária',
        description: 'Insira a API Key da OpenAI para testar.',
        variant: 'destructive',
      });
      return;
    }

    setTestingOpenAI(true);
    setOpenAIStatus('idle');

    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/test-openai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: settings.openaiApiKey }),
      });

      const data = await response.json();

      if (data.success) {
        setOpenAIStatus('success');
        toast({
          title: 'Conexão bem-sucedida!',
          description: 'A API da OpenAI está funcionando corretamente.',
        });
      } else {
        setOpenAIStatus('error');
        toast({
          title: 'Falha na conexão',
          description: data.error || 'Verifique sua API Key.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setOpenAIStatus('error');
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar à API.',
        variant: 'destructive',
      });
    } finally {
      setTestingOpenAI(false);
    }
  };

  const handleTestEvolution = async () => {
    if (!settings.evolutionApiUrl || !settings.evolutionApiKey) {
      toast({
        title: 'Dados necessários',
        description: 'Insira a URL e API Key da Evolution para testar.',
        variant: 'destructive',
      });
      return;
    }

    setTestingEvolution(true);
    setEvolutionStatus('idle');

    try {
      const response = await fetch(`${API_BASE_URL}/api/settings/test-evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiUrl: settings.evolutionApiUrl, 
          apiKey: settings.evolutionApiKey 
        }),
      });

      const data = await response.json();

      if (data.success) {
        setEvolutionStatus('success');
        toast({
          title: 'Conexão bem-sucedida!',
          description: `Evolution API conectada. ${data.instances?.length || 0} instância(s) encontrada(s).`,
        });
      } else {
        setEvolutionStatus('error');
        toast({
          title: 'Falha na conexão',
          description: data.error || 'Verifique suas credenciais.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setEvolutionStatus('error');
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar à API.',
        variant: 'destructive',
      });
    } finally {
      setTestingEvolution(false);
    }
  };

  const getStatusIcon = (status: 'idle' | 'success' | 'error') => {
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-success" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-destructive" />;
    return null;
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Configurações" 
        subtitle="Configure as integrações e APIs do sistema"
      />

      <div className="max-w-2xl space-y-6">
        {/* OpenAI Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">OpenAI</h2>
                <p className="text-sm text-muted-foreground">Configurações da API OpenAI</p>
              </div>
            </div>
            {getStatusIcon(openAIStatus)}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openai-key">API Key</Label>
              <div className="relative">
                <Input
                  id="openai-key"
                  type={showKeys.openai ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.openaiApiKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, openaiApiKey: e.target.value }))}
                  className="bg-muted border-border pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowKeys(prev => ({ ...prev, openai: !prev.openai }))}
                >
                  {showKeys.openai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Modelo Padrão</Label>
              <Select 
                value={settings.defaultModel}
                onValueChange={(value) => setSettings(prev => ({ ...prev, defaultModel: value }))}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                  <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleTestOpenAI}
              disabled={testingOpenAI}
            >
              {testingOpenAI ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Testar Conexão OpenAI
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Evolution API Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Evolution API</h2>
                <p className="text-sm text-muted-foreground">Conexão com WhatsApp</p>
              </div>
            </div>
            {getStatusIcon(evolutionStatus)}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evolution-url">URL da API</Label>
              <Input
                id="evolution-url"
                placeholder="https://sua-evolution-api.com"
                value={settings.evolutionApiUrl}
                onChange={(e) => setSettings(prev => ({ ...prev, evolutionApiUrl: e.target.value }))}
                className="bg-muted border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution-key">API Key</Label>
              <div className="relative">
                <Input
                  id="evolution-key"
                  type={showKeys.evolution ? 'text' : 'password'}
                  placeholder="Sua chave da Evolution API"
                  value={settings.evolutionApiKey}
                  onChange={(e) => setSettings(prev => ({ ...prev, evolutionApiKey: e.target.value }))}
                  className="bg-muted border-border pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowKeys(prev => ({ ...prev, evolution: !prev.evolution }))}
                >
                  {showKeys.evolution ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleTestEvolution}
              disabled={testingEvolution}
            >
              {testingEvolution ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Testar Conexão Evolution
                </>
              )}
            </Button>
          </div>
        </motion.div>

        {/* Test Agent Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Testar Agente</h2>
              <p className="text-sm text-muted-foreground">Simule conversas com seus agentes</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar Agente</Label>
              <Select 
                value={selectedAgent?.id || ''}
                onValueChange={(value) => {
                  const agent = agents?.find((a: any) => a.id === value);
                  setSelectedAgent(agent || null);
                }}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Escolha um agente para testar" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {agents?.map((agent: any) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => setTestAgentModalOpen(true)}
              disabled={!selectedAgent}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Abrir Chat de Teste
            </Button>
          </div>
        </motion.div>

        {/* Database Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-info" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Banco de Dados</h2>
              <p className="text-sm text-muted-foreground">Conexão PostgreSQL via Easypanel</p>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              Configure a conexão com seu banco de dados PostgreSQL através do Lovable Cloud 
              para persistência de dados e histórico de conversas.
            </p>
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex justify-end"
        >
          <Button className="btn-primary-gradient" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </motion.div>
      </div>

      <TestAgentModal
        open={testAgentModalOpen}
        onOpenChange={setTestAgentModalOpen}
        agent={selectedAgent}
      />
    </MainLayout>
  );
};

export default SettingsPage;
