import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Image, 
  AlertCircle, 
  Info, 
  Wrench, 
  RefreshCw,
  Filter,
  Clock,
  Bot,
  MessageSquare
} from 'lucide-react';
import { getLogs, getLogStats, getAgents } from '@/lib/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const logTypeConfig: Record<string, { icon: typeof FileText; color: string; label: string }> = {
  tool_call: { icon: Wrench, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Tool Call' },
  media_send: { icon: Image, color: 'bg-green-500/10 text-green-500 border-green-500/20', label: 'Mídia Enviada' },
  media_match: { icon: Image, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'Mídia Encontrada' },
  faq_match: { icon: MessageSquare, color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', label: 'FAQ Match' },
  error: { icon: AlertCircle, color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Erro' },
  info: { icon: Info, color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', label: 'Info' },
};

export default function LogsPage() {
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: getAgents,
  });

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['logs', selectedAgent, selectedType],
    queryFn: () => getLogs(
      selectedAgent !== 'all' ? selectedAgent : undefined,
      selectedType !== 'all' ? selectedType : undefined
    ),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
  });

  const { data: stats } = useQuery({
    queryKey: ['log-stats', selectedAgent],
    queryFn: () => getLogStats(selectedAgent !== 'all' ? selectedAgent : undefined),
  });

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Logs do Sistema</h1>
            <p className="text-muted-foreground mt-1">
              Monitore chamadas de mídia, tool calling e eventos em tempo real
            </p>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total de Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {stats?.byType?.slice(0, 3).map((type: any) => {
            const config = logTypeConfig[type.log_type] || logTypeConfig.info;
            const Icon = config.icon;
            return (
              <Card key={type.log_type} className="glass-card">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{type.count}</p>
                      <p className="text-xs text-muted-foreground">{config.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Agentes</SelectItem>
                  {agents.map((agent: any) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Tipos</SelectItem>
                  <SelectItem value="tool_call">Tool Call</SelectItem>
                  <SelectItem value="media_send">Mídia Enviada</SelectItem>
                  <SelectItem value="media_match">Mídia Encontrada</SelectItem>
                  <SelectItem value="faq_match">FAQ Match</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Logs List */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Logs em Tempo Real
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-3">
                {logs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum log encontrado</p>
                    <p className="text-sm">Os logs aparecerão aqui quando houver atividade</p>
                  </div>
                ) : (
                  logs.map((log: any, index: number) => {
                    const config = logTypeConfig[log.log_type] || logTypeConfig.info;
                    const Icon = config.icon;
                    
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className="p-4 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={config.color}>
                                {config.label}
                              </Badge>
                              {log.agent_name && (
                                <Badge variant="secondary" className="gap-1">
                                  <Bot className="w-3 h-3" />
                                  {log.agent_name}
                                </Badge>
                              )}
                              {log.source && (
                                <Badge variant="outline" className="text-xs">
                                  {log.source}
                                </Badge>
                              )}
                              {log.phone_number && (
                                <span className="text-xs text-muted-foreground">
                                  📱 {log.phone_number}
                                </span>
                              )}
                            </div>
                            
                            <p className="font-medium mt-1">{log.action}</p>
                            
                            {log.details && Object.keys(log.details).length > 0 && (
                              <pre className="mt-2 p-2 rounded bg-muted/50 text-xs overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                            
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
