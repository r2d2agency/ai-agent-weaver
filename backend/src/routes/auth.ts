import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../services/database.js';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'whatsagent-secret-key-change-in-production';

// Login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await query(
      'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Get current user
authRouter.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const result = await query(
      'SELECT id, email, name, role, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Create user (admin only)
authRouter.post('/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { email, password, name, role, agentIds } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO users (email, password_hash, name, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, name, role, created_at`,
      [email.toLowerCase(), hashedPassword, name, role || 'user']
    );

    const newUser = result.rows[0];

    // Add agent access if provided
    if (agentIds && agentIds.length > 0) {
      for (const agentId of agentIds) {
        await query(
          `INSERT INTO user_agent_access (user_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUser.id, agentId]
        );
      }
    }

    res.status(201).json(newUser);
  } catch (error: any) {
    console.error('Create user error:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// List users (admin only)
authRouter.get('/users', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at,
              COALESCE(
                json_agg(
                  json_build_object('id', a.id, 'name', a.name)
                ) FILTER (WHERE a.id IS NOT NULL), 
                '[]'
              ) as agents
       FROM users u
       LEFT JOIN user_agent_access uaa ON u.id = uaa.user_id
       LEFT JOIN agents a ON uaa.agent_id = a.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Update user (admin only)
authRouter.put('/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { id } = req.params;
    const { email, password, name, role, agentIds } = req.body;

    let updateQuery = 'UPDATE users SET updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [];
    let paramCount = 0;

    if (email) {
      paramCount++;
      updateQuery += `, email = $${paramCount}`;
      params.push(email.toLowerCase());
    }

    if (name) {
      paramCount++;
      updateQuery += `, name = $${paramCount}`;
      params.push(name);
    }

    if (role) {
      paramCount++;
      updateQuery += `, role = $${paramCount}`;
      params.push(role);
    }

    if (password) {
      paramCount++;
      const hashedPassword = await bcrypt.hash(password, 10);
      updateQuery += `, password_hash = $${paramCount}`;
      params.push(hashedPassword);
    }

    paramCount++;
    updateQuery += ` WHERE id = $${paramCount} RETURNING id, email, name, role`;
    params.push(id);

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Update agent access
    if (agentIds !== undefined) {
      await query('DELETE FROM user_agent_access WHERE user_id = $1', [id]);
      for (const agentId of agentIds) {
        await query(
          `INSERT INTO user_agent_access (user_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, agentId]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Delete user (admin only)
authRouter.delete('/users/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { id } = req.params;

    // Prevent deleting yourself
    if (id === decoded.userId) {
      return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ message: 'Usuário excluído' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Get user's accessible agents
authRouter.get('/my-agents', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Admin has access to all agents
    if (decoded.role === 'admin') {
      const result = await query('SELECT * FROM agents ORDER BY created_at DESC');
      return res.json(result.rows);
    }

    // Regular users only see their assigned agents
    const result = await query(
      `SELECT a.* FROM agents a
       INNER JOIN user_agent_access uaa ON a.id = uaa.agent_id
       WHERE uaa.user_id = $1
       ORDER BY a.created_at DESC`,
      [decoded.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get my agents error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});
