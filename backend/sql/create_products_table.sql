-- Create products table for AI product catalog/RAG
CREATE TABLE IF NOT EXISTS agent_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100),
  sku VARCHAR(100),
  stock INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_products_agent_id ON agent_products(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_products_category ON agent_products(category);
CREATE INDEX IF NOT EXISTS idx_agent_products_name ON agent_products(name);
