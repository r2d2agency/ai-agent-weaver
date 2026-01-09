import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Eye, EyeOff, Key, Globe, Cpu, Database } from 'lucide-react';
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

const SettingsPage = () => {
  const { toast } = useToast();
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

  const handleSave = () => {
    // Here you would save to database
    toast({
      title: 'Configurações salvas!',
      description: 'Suas configurações foram atualizadas com sucesso.',
    });
  };

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
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">OpenAI</h2>
              <p className="text-sm text-muted-foreground">Configurações da API OpenAI</p>
            </div>
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
          </div>
        </motion.div>

        {/* Evolution API Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <Globe className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Evolution API</h2>
              <p className="text-sm text-muted-foreground">Conexão com WhatsApp</p>
            </div>
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
          <Button className="btn-primary-gradient" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Salvar Configurações
          </Button>
        </motion.div>
      </div>
    </MainLayout>
  );
};

export default SettingsPage;
