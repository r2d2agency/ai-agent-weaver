import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Bot, 
  MessageSquare, 
  Settings, 
  LayoutDashboard,
  Webhook,
  FileText
} from 'lucide-react';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Bot, label: 'Agentes', path: '/agents' },
  { icon: MessageSquare, label: 'Mensagens', path: '/messages' },
  { icon: Webhook, label: 'Webhooks', path: '/webhooks' },
  { icon: FileText, label: 'Documentos', path: '/documents' },
  { icon: Settings, label: 'Configurações', path: '/settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center">
            <Bot className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-foreground">WhatsAgent</h1>
            <p className="text-xs text-muted-foreground">AI Automation</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item, index) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path));
          
          return (
            <motion.div
              key={item.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                to={item.path}
                className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full status-online" />
            <span className="text-sm font-medium text-foreground">Sistema Online</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Evolution API conectada
          </p>
        </div>
      </div>
    </aside>
  );
}
