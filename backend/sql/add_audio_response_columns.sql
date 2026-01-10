-- Add audio response columns to agents table
-- Run this migration on your PostgreSQL database

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS audio_response_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS audio_response_voice VARCHAR(50) DEFAULT 'nova';

-- Comment for documentation
COMMENT ON COLUMN agents.audio_response_enabled IS 'Whether the agent should respond with audio when user sends audio';
COMMENT ON COLUMN agents.audio_response_voice IS 'OpenAI TTS voice: nova (female), onyx (male), alloy, echo, fable, shimmer';
