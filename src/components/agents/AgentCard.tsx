import { motion } from 'framer-motion';
import { Bot, MoreVertical, Power, Edit, Trash2 } from 'lucide-react';
import { Agent } from '@/types/agent';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';

interface AgentCardProps {
  agent: Agent;
  delay?: number;
  onToggleStatus?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function AgentCard({ agent, delay = 0, onToggleStatus, onDelete }: AgentCardProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="glass-card-hover p-6 cursor-pointer group"
      onClick={() => navigate(`/agents/${agent.id}`)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-emerald-600/20 flex items-center justify-center border border-primary/20">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${agent.status === 'online' ? 'status-online' : 'status-offline'}`} />
              <span className="text-xs text-muted-foreground capitalize">{agent.status}</span>
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleStatus?.(agent.id); }}>
              <Power className="w-4 h-4 mr-2" />
              {agent.status === 'online' ? 'Desativar' : 'Ativar'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/edit`); }}>
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); onDelete?.(agent.id); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
        {agent.description}
      </p>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t border-border">
        <span>Instância: {agent.instanceName}</span>
        <span>{agent.messagesCount} mensagens</span>
      </div>
    </motion.div>
  );
}
