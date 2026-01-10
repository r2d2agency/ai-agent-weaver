-- Add required_fields column to agents table
-- This stores an array of required fields that must be collected before transfer
-- Format: [{ "key": "nome", "question": "Qual o seu nome por favor?" }, ...]

ALTER TABLE agents ADD COLUMN IF NOT EXISTS required_fields JSONB DEFAULT '[]';

-- Add collected_data column to contacts table to store collected field values
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS collected_data JSONB DEFAULT '{}';
