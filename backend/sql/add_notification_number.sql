-- Add notification_number column to agents table for human transfer notifications
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS notification_number VARCHAR(50) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN agents.notification_number IS 'WhatsApp number to notify when AI wants to transfer to a human';
