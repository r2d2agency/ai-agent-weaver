import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Bot, 
  MessageSquare, 
  Settings, 
  LayoutDashboard,
  Webhook,
  FileText,
  Users,
  LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

export function Sidebar() {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Bot, label: 'Agentes', path: '/agents' },
    { icon: MessageSquare, label: 'Mensagens', path: '/messages' },
    { icon: Webhook, label: 'Webhooks', path: '/webhooks' },
    { icon: FileText, label: 'Documentos', path: '/documents' },
    { icon: Settings, label: 'Configurações', path: '/settings' },
    ...(isAdmin ? [{ icon: Users, label: 'Usuários', path: '/users' }] : []),
  ];

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

      <div className="p-4 border-t border-sidebar-border space-y-4">
        {user && (
          <div className="glass-card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full"
              onClick={logout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
