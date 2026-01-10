-- Add widget training mode columns to agents table
-- Run this migration if you have an existing database

ALTER TABLE agents ADD COLUMN IF NOT EXISTS widget_training_mode BOOLEAN DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS widget_reset_code VARCHAR(100);
