-- Add image_url column to agent_products table
ALTER TABLE agent_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Comment explaining the column
COMMENT ON COLUMN agent_products.image_url IS 'URL da imagem do produto para a IA enviar via WhatsApp';
