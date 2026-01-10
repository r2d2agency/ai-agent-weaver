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
        audio_enabled BOOLEAN DEFAULT true,
        image_enabled BOOLEAN DEFAULT true,
        document_enabled BOOLEAN DEFAULT true,
        widget_enabled BOOLEAN DEFAULT false,
        ghost_mode BOOLEAN DEFAULT false,
        takeover_timeout INTEGER DEFAULT 60,
        inactivity_enabled BOOLEAN DEFAULT false,
        inactivity_timeout INTEGER DEFAULT 5,
        inactivity_message TEXT DEFAULT 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋',
        operating_hours_enabled BOOLEAN DEFAULT false,
        operating_hours_start TIME DEFAULT '09:00',
        operating_hours_end TIME DEFAULT '18:00',
        operating_hours_timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
        out_of_hours_message TEXT DEFAULT 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐',
        evolution_api_url VARCHAR(500),
        evolution_api_key VARCHAR(255),
        widget_avatar_url TEXT,
        widget_position VARCHAR(10) DEFAULT 'right',
        widget_title VARCHAR(255) DEFAULT 'Assistente',
        widget_primary_color VARCHAR(20) DEFAULT '#667eea',
        widget_secondary_color VARCHAR(20) DEFAULT '#764ba2',
        widget_background_color VARCHAR(20) DEFAULT '#ffffff',
        widget_text_color VARCHAR(20) DEFAULT '#333333',
        openai_api_key VARCHAR(255),
        openai_model VARCHAR(100) DEFAULT 'gpt-4o',
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
        is_audio BOOLEAN DEFAULT false,
        is_from_owner BOOLEAN DEFAULT false,
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

      -- Widget messages table
      CREATE TABLE IF NOT EXISTS widget_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        session_id VARCHAR(255) NOT NULL,
        sender VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Contacts table for storing user information
      CREATE TABLE IF NOT EXISTS contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        phone_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255),
        notes TEXT,
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Conversation takeover tracking (when owner assumes control)
      CREATE TABLE IF NOT EXISTS conversation_takeover (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        taken_over_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, phone_number)
      );

      -- Track last activity per conversation for inactivity timeout
      CREATE TABLE IF NOT EXISTS conversation_activity (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        last_user_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_agent_message_at TIMESTAMP,
        inactivity_message_sent BOOLEAN DEFAULT false,
        UNIQUE(agent_id, phone_number)
      );

      -- Agent media gallery (images, videos) for RAG
      CREATE TABLE IF NOT EXISTS agent_media (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        media_type VARCHAR(20) NOT NULL, -- 'image' | 'gallery' | 'video'
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        file_urls TEXT[] NOT NULL, -- Array of URLs (1 for single, up to 4 for gallery)
        file_sizes INTEGER[],
        mime_types VARCHAR(100)[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- FAQ table for frequently asked questions
      CREATE TABLE IF NOT EXISTS agent_faqs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        keywords TEXT[] DEFAULT '{}',
        usage_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- FAQ usage log for analytics
      CREATE TABLE IF NOT EXISTS faq_usage_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        faq_id UUID REFERENCES agent_faqs(id) ON DELETE CASCADE NOT NULL,
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
        session_id VARCHAR(255),
        source VARCHAR(20) DEFAULT 'widget', -- 'widget' or 'whatsapp'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Add new columns if they don't exist (for existing databases)
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='audio_enabled') THEN
          ALTER TABLE agents ADD COLUMN audio_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_enabled') THEN
          ALTER TABLE agents ADD COLUMN widget_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='ghost_mode') THEN
          ALTER TABLE agents ADD COLUMN ghost_mode BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='takeover_timeout') THEN
          ALTER TABLE agents ADD COLUMN takeover_timeout INTEGER DEFAULT 60;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='inactivity_enabled') THEN
          ALTER TABLE agents ADD COLUMN inactivity_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='inactivity_timeout') THEN
          ALTER TABLE agents ADD COLUMN inactivity_timeout INTEGER DEFAULT 5;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='inactivity_message') THEN
          ALTER TABLE agents ADD COLUMN inactivity_message TEXT DEFAULT 'Parece que você foi embora. Qualquer coisa, estou por aqui! 👋';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='operating_hours_enabled') THEN
          ALTER TABLE agents ADD COLUMN operating_hours_enabled BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='operating_hours_start') THEN
          ALTER TABLE agents ADD COLUMN operating_hours_start TIME DEFAULT '09:00';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='operating_hours_end') THEN
          ALTER TABLE agents ADD COLUMN operating_hours_end TIME DEFAULT '18:00';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='operating_hours_timezone') THEN
          ALTER TABLE agents ADD COLUMN operating_hours_timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='out_of_hours_message') THEN
          ALTER TABLE agents ADD COLUMN out_of_hours_message TEXT DEFAULT 'Olá! Nosso horário de atendimento é das 09:00 às 18:00. Deixe sua mensagem que responderemos assim que possível! 🕐';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='image_enabled') THEN
          ALTER TABLE agents ADD COLUMN image_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='document_enabled') THEN
          ALTER TABLE agents ADD COLUMN document_enabled BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='openai_api_key') THEN
          ALTER TABLE agents ADD COLUMN openai_api_key VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='openai_model') THEN
          ALTER TABLE agents ADD COLUMN openai_model VARCHAR(100) DEFAULT 'gpt-4o';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='evolution_api_url') THEN
          ALTER TABLE agents ADD COLUMN evolution_api_url VARCHAR(500);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='evolution_api_key') THEN
          ALTER TABLE agents ADD COLUMN evolution_api_key VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_avatar_url') THEN
          ALTER TABLE agents ADD COLUMN widget_avatar_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_position') THEN
          ALTER TABLE agents ADD COLUMN widget_position VARCHAR(10) DEFAULT 'right';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_title') THEN
          ALTER TABLE agents ADD COLUMN widget_title VARCHAR(255) DEFAULT 'Assistente';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_primary_color') THEN
          ALTER TABLE agents ADD COLUMN widget_primary_color VARCHAR(20) DEFAULT '#667eea';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_secondary_color') THEN
          ALTER TABLE agents ADD COLUMN widget_secondary_color VARCHAR(20) DEFAULT '#764ba2';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_background_color') THEN
          ALTER TABLE agents ADD COLUMN widget_background_color VARCHAR(20) DEFAULT '#ffffff';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='widget_text_color') THEN
          ALTER TABLE agents ADD COLUMN widget_text_color VARCHAR(20) DEFAULT '#333333';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_audio') THEN
          ALTER TABLE messages ADD COLUMN is_audio BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='is_from_owner') THEN
          ALTER TABLE messages ADD COLUMN is_from_owner BOOLEAN DEFAULT false;
        END IF;
      END $$;
    `);

    // Create default admin user if not exists
    const adminCheck = await client.query(
      `SELECT id FROM users WHERE email = 'admin@whatsagent.com'`
    );
    
    if (adminCheck.rows.length === 0) {
      // Default password: admin123 (should be changed on first login)
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.default.hash('admin123', 10);
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
