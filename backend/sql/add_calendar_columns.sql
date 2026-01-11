-- Add calendar columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS calendar_enabled BOOLEAN DEFAULT false;

-- Create table for storing Google Calendar OAuth tokens per agent
CREATE TABLE IF NOT EXISTS agent_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP NOT NULL,
    google_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_calendar_tokens_agent ON agent_calendar_tokens(agent_id);
