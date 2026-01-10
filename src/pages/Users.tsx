import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Edit, Trash2, Shield, User, Loader2, CheckCircle } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, getAgents } from '@/lib/api';
interface UserData {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  created_at: string;
  agents: { id: string; name: string }[];
}

const UsersPage = () => {
  const { token, isAdmin } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserData[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'user' as 'admin' | 'user',
    agentIds: [] as string[],
  });

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchAgents();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Fetch users error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (error) {
      console.error('Fetch agents error:', error);
    }
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'user',
      agentIds: [],
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (user: UserData) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      agentIds: user.agents.map(a => a.id),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingUser 
        ? `${API_BASE_URL}/api/auth/users/${editingUser.id}`
        : `${API_BASE_URL}/api/auth/users`;
      
      const body: any = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        agentIds: formData.agentIds,
      };

      if (formData.password) {
        body.password = formData.password;
      }

      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      toast({
        title: editingUser ? 'Usuário atualizado!' : 'Usuário criado!',
        description: `${formData.name} foi ${editingUser ? 'atualizado' : 'criado'} com sucesso.`,
      });

      setModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (user: UserData) => {
    if (!confirm(`Tem certeza que deseja excluir ${user.name}?`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      toast({
        title: 'Usuário excluído',
        description: `${user.name} foi removido.`,
        variant: 'destructive',
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const toggleAgentAccess = (agentId: string) => {
    setFormData(prev => ({
      ...prev,
      agentIds: prev.agentIds.includes(agentId)
        ? prev.agentIds.filter(id => id !== agentId)
        : [...prev.agentIds, agentId],
    }));
  };

  if (!isAdmin) {
    return (
      <MainLayout>
        <Header title="Acesso Negado" />
        <div className="glass-card p-8 text-center">
          <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Usuários" 
        subtitle="Gerencie os usuários e seus acessos aos agentes"
      />

      <div className="mb-6 flex justify-end">
        <Button className="btn-primary-gradient" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    user.role === 'admin' ? 'bg-primary/10' : 'bg-muted'
                  }`}>
                    {user.role === 'admin' ? (
                      <Shield className="w-6 h-6 text-primary" />
                    ) : (
                      <User className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{user.name}</h3>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                        {user.role === 'admin' ? 'Administrador' : 'Usuário'}
                      </Badge>
                      {user.agents.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {user.agents.length} agente(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenEdit(user)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDelete(user)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {user.role !== 'admin' && user.agents.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Agentes com acesso:</p>
                  <div className="flex flex-wrap gap-2">
                    {user.agents.map(agent => (
                      <Badge key={agent.id} variant="secondary">
                        {agent.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Users className="w-5 h-5 text-primary" />
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Atualize as informações do usuário'
                : 'Preencha os dados para criar um novo usuário'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="bg-muted border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="bg-muted border-border"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Senha {editingUser && '(deixe vazio para manter)'}
              </Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                className="bg-muted border-border"
                required={!editingUser}
              />
            </div>

            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select 
                value={formData.role}
                onValueChange={(value: 'admin' | 'user') => setFormData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.role === 'user' && agents.length > 0 && (
              <div className="space-y-2">
                <Label>Acesso aos Agentes</Label>
                <div className="border border-border rounded-lg p-4 space-y-3 max-h-48 overflow-y-auto">
                  {agents.map(agent => (
                    <div key={agent.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`agent-${agent.id}`}
                        checked={formData.agentIds.includes(agent.id)}
                        onCheckedChange={() => toggleAgentAccess(agent.id)}
                      />
                      <label 
                        htmlFor={`agent-${agent.id}`}
                        className="text-sm text-foreground cursor-pointer flex-1"
                      >
                        {agent.name}
                      </label>
                      {formData.agentIds.includes(agent.id) && (
                        <CheckCircle className="w-4 h-4 text-success" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Administradores têm acesso a todos os agentes automaticamente.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="btn-primary-gradient">
                {editingUser ? 'Salvar' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default UsersPage;
