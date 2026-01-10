import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        prompt TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'offline',
        instance_name VARCHAR(255) NOT NULL,
        webhook_url VARCHAR(500),
        token VARCHAR(255),
        messages_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        sender VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'sent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        size INTEGER,
        content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Users table for authentication
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- User-Agent access control (many-to-many)
      CREATE TABLE IF NOT EXISTS user_agent_access (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, agent_id)
      );
    `);

    // Create default admin user if not exists
    const adminCheck = await client.query(
      `SELECT id FROM users WHERE email = 'admin@whatsagent.com'`
    );
    
    if (adminCheck.rows.length === 0) {
      // Default password: admin123 (should be changed on first login)
      const { hash } = await import('bcryptjs');
      const hashedPassword = await hash('admin123', 10);
      await client.query(
        `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)`,
        ['admin@whatsagent.com', hashedPassword, 'Administrador', 'admin']
      );
      console.log('✅ Default admin user created (admin@whatsagent.com / admin123)');
    }
  } finally {
    client.release();
  }
}

export async function query(text: string, params?: any[]) {
  const result = await pool.query(text, params);
  return result;
}

export default pool;
