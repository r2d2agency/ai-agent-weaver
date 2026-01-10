-- Add transfer_instructions column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS transfer_instructions TEXT;

-- Comment
COMMENT ON COLUMN agents.transfer_instructions IS 'Custom instructions for human transfer - what information to include';
