import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  MessageSquare, 
  Settings, 
  LayoutDashboard,
  Webhook,
  FileText,
  Users,
  LogOut,
  ScrollText,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ isOpen = true, onToggle }: SidebarProps) {
  const location = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { systemName, logoUrl, iconUrl } = useBranding();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Bot, label: 'Agentes', path: '/agents' },
    { icon: MessageSquare, label: 'Mensagens', path: '/messages' },
    { icon: ScrollText, label: 'Logs', path: '/logs' },
    { icon: Webhook, label: 'Webhooks', path: '/webhooks' },
    { icon: FileText, label: 'Documentos', path: '/documents' },
    { icon: Settings, label: 'Configurações', path: '/settings' },
    ...(isAdmin ? [{ icon: Users, label: 'Usuários', path: '/users' }] : []),
  ];

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const sidebarContent = (
    <>
      <div className="p-4 lg:p-6 border-b border-sidebar-border flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={systemName} 
              className="h-8 lg:h-10 object-contain"
            />
          ) : (
            <>
              <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                {iconUrl ? (
                  <img src={iconUrl} alt={systemName} className="w-full h-full object-cover" />
                ) : (
                  <Bot className="w-5 h-5 lg:w-6 lg:h-6 text-primary-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base lg:text-lg text-foreground truncate">{systemName}</h1>
                <p className="text-xs text-muted-foreground">AI Automation</p>
              </div>
            </>
          )}
        </Link>
        {/* Mobile close button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto">
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
                onClick={() => setIsMobileOpen(false)}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium truncate">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="p-3 lg:p-4 border-t border-sidebar-border">
        {user && (
          <div className="glass-card p-3 lg:p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
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
    </>
  );

  return (
    <>
      {/* Mobile menu button - fixed at top */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-background border border-border shadow-lg"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="lg:hidden fixed left-0 top-0 h-screen w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-50"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 bg-sidebar border-r border-sidebar-border flex-col">
        {sidebarContent}
      </aside>
    </>
  );
}
