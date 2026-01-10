import { query } from './database.js';
import { sendMessage } from './evolution.js';

let inactivityInterval: ReturnType<typeof setInterval> | null = null;

export function startInactivityChecker() {
  // Check every 30 seconds for inactive conversations
  inactivityInterval = setInterval(checkInactiveConversations, 30000);
  console.log('✅ Inactivity checker started (runs every 30s)');
}

export function stopInactivityChecker() {
  if (inactivityInterval) {
    clearInterval(inactivityInterval);
    inactivityInterval = null;
    console.log('🛑 Inactivity checker stopped');
  }
}

async function checkInactiveConversations() {
  try {
    // Find conversations that:
    // 1. Have an agent with inactivity_enabled = true
    // 2. Last user message was more than inactivity_timeout minutes ago
    // 3. Agent responded after user's last message
    // 4. Inactivity message hasn't been sent yet
    const result = await query(`
      SELECT 
        ca.id as activity_id,
        ca.agent_id,
        ca.phone_number,
        ca.last_user_message_at,
        ca.last_agent_message_at,
        a.instance_name,
        a.inactivity_message,
        a.inactivity_timeout,
        a.ghost_mode
      FROM conversation_activity ca
      JOIN agents a ON a.id = ca.agent_id
      WHERE 
        a.status = 'online'
        AND a.ghost_mode = false
        AND a.inactivity_enabled = true
        AND ca.inactivity_message_sent = false
        AND ca.last_agent_message_at IS NOT NULL
        AND ca.last_agent_message_at > ca.last_user_message_at
        AND ca.last_user_message_at < NOW() - (a.inactivity_timeout || ' minutes')::interval
    `);

    for (const conv of result.rows) {
      try {
        console.log(`Sending inactivity message to ${conv.phone_number} for agent ${conv.agent_id}`);
        
        // Send the inactivity message
        await sendMessage(conv.instance_name, conv.phone_number, conv.inactivity_message);
        
        // Save the message in history
        await query(
          `INSERT INTO messages (agent_id, sender, content, phone_number, status, is_from_owner) 
           VALUES ($1, 'agent', $2, $3, 'sent', false)`,
          [conv.agent_id, conv.inactivity_message, conv.phone_number]
        );
        
        // Mark as sent so we don't send again
        await query(
          `UPDATE conversation_activity 
           SET inactivity_message_sent = true 
           WHERE id = $1`,
          [conv.activity_id]
        );
        
        // Update agent message count
        await query(
          `UPDATE agents SET messages_count = messages_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [conv.agent_id]
        );
        
        console.log(`✅ Inactivity message sent to ${conv.phone_number}`);
      } catch (err) {
        console.error(`Failed to send inactivity message to ${conv.phone_number}:`, err);
      }
    }
  } catch (error) {
    console.error('Error checking inactive conversations:', error);
  }
}
