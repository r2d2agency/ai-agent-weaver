-- Add takeover tracking columns to conversation_activity
ALTER TABLE conversation_activity ADD COLUMN IF NOT EXISTS takeover_active BOOLEAN DEFAULT false;
ALTER TABLE conversation_activity ADD COLUMN IF NOT EXISTS takeover_until TIMESTAMP;
