import { Router } from 'express';
import { query } from '../services/database.js';

export const logsRouter = Router();

// Get all logs with optional filters
logsRouter.get('/', async (req, res) => {
  try {
    const { agent_id, log_type, limit = 100 } = req.query;
    
    let sql = `
      SELECT l.*, a.name as agent_name 
      FROM system_logs l 
      LEFT JOIN agents a ON l.agent_id = a.id 
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (agent_id) {
      params.push(agent_id);
      sql += ` AND l.agent_id = $${params.length}`;
    }
    
    if (log_type) {
      params.push(log_type);
      sql += ` AND l.log_type = $${params.length}`;
    }
    
    params.push(parseInt(limit as string) || 100);
    sql += ` ORDER BY l.created_at DESC LIMIT $${params.length}`;
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Get log stats
logsRouter.get('/stats', async (req, res) => {
  try {
    const { agent_id } = req.query;
    
    let whereClause = '';
    const params: any[] = [];
    
    if (agent_id) {
      params.push(agent_id);
      whereClause = ` WHERE agent_id = $1`;
    }
    
    const [totalResult, typesResult, recentResult] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM system_logs${whereClause}`, params),
      query(`
        SELECT log_type, COUNT(*) as count 
        FROM system_logs${whereClause} 
        GROUP BY log_type 
        ORDER BY count DESC
      `, params),
      query(`
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM system_logs${whereClause} 
        GROUP BY DATE(created_at) 
        ORDER BY date DESC 
        LIMIT 7
      `, params),
    ]);
    
    res.json({
      total: parseInt(totalResult.rows[0]?.total || '0'),
      byType: typesResult.rows,
      recent: recentResult.rows,
    });
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ error: 'Failed to fetch log stats' });
  }
});

// Clear logs (optional, for maintenance)
logsRouter.delete('/clear', async (req, res) => {
  try {
    const { before_days = 30 } = req.query;
    const days = parseInt(before_days as string) || 30;
    
    await query(
      `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '${days} days'`
    );
    
    res.json({ success: true, message: `Logs older than ${days} days deleted` });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Helper function to create logs (exported for use in other services)
export async function createLog(
  agentId: string | null,
  logType: 'tool_call' | 'media_send' | 'media_match' | 'error' | 'info' | 'faq_match',
  action: string,
  details: Record<string, any> = {},
  phoneNumber?: string,
  source: 'whatsapp' | 'widget' = 'whatsapp'
) {
  try {
    await query(
      `INSERT INTO system_logs (agent_id, log_type, action, details, phone_number, source) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [agentId, logType, action, JSON.stringify(details), phoneNumber, source]
    );
  } catch (error) {
    console.error('Error creating log:', error);
  }
}
