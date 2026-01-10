import { Router } from 'express';
import { query } from '../services/database.js';

export const faqRouter = Router();

// Get all FAQs for an agent
faqRouter.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT * FROM agent_faqs WHERE agent_id = $1 ORDER BY usage_count DESC, created_at DESC`,
      [agentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

// Get FAQ analytics/stats
faqRouter.get('/:agentId/stats', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Get top FAQs by usage
    const topFaqs = await query(
      `SELECT id, question, answer, usage_count 
       FROM agent_faqs 
       WHERE agent_id = $1 AND is_active = true 
       ORDER BY usage_count DESC 
       LIMIT 10`,
      [agentId]
    );
    
    // Get usage over time (last 30 days)
    const usageOverTime = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM faq_usage_log 
       WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) 
       ORDER BY date DESC`,
      [agentId]
    );
    
    // Get total API calls saved
    const totalSaved = await query(
      `SELECT COUNT(*) as total FROM faq_usage_log WHERE agent_id = $1`,
      [agentId]
    );
    
    res.json({
      topFaqs: topFaqs.rows,
      usageOverTime: usageOverTime.rows,
      totalApiCallsSaved: parseInt(totalSaved.rows[0]?.total || '0', 10)
    });
  } catch (error) {
    console.error('Error fetching FAQ stats:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ stats' });
  }
});

// Create a new FAQ
faqRouter.post('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { question, answer, keywords } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }
    
    // Extract keywords automatically if not provided
    const autoKeywords = keywords || extractKeywords(question);
    
    const result = await query(
      `INSERT INTO agent_faqs (agent_id, question, answer, keywords) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [agentId, question, answer, autoKeywords]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating FAQ:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

// Update a FAQ
faqRouter.put('/:agentId/:faqId', async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, keywords, is_active } = req.body;
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (question !== undefined) {
      updates.push(`question = $${paramIndex++}`);
      values.push(question);
    }
    if (answer !== undefined) {
      updates.push(`answer = $${paramIndex++}`);
      values.push(answer);
    }
    if (keywords !== undefined) {
      updates.push(`keywords = $${paramIndex++}`);
      values.push(keywords);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(faqId);
    
    const result = await query(
      `UPDATE agent_faqs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating FAQ:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

// Delete a FAQ
faqRouter.delete('/:agentId/:faqId', async (req, res) => {
  try {
    const { faqId } = req.params;
    
    await query('DELETE FROM agent_faqs WHERE id = $1', [faqId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

// Helper to extract keywords from a question
function extractKeywords(text: string): string[] {
  // Remove common Portuguese stop words and extract meaningful words
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
    'em', 'na', 'no', 'nas', 'nos', 'por', 'para', 'com', 'sem', 'sob', 'sobre',
    'entre', 'até', 'após', 'antes', 'durante', 'e', 'ou', 'mas', 'porém', 'contudo',
    'que', 'qual', 'quais', 'quando', 'quanto', 'como', 'onde', 'porque', 'por que',
    'se', 'não', 'sim', 'já', 'ainda', 'também', 'só', 'apenas', 'muito', 'pouco',
    'mais', 'menos', 'bem', 'mal', 'aqui', 'ali', 'lá', 'aí', 'esse', 'essa', 'este',
    'esta', 'isso', 'isto', 'aquele', 'aquela', 'meu', 'minha', 'seu', 'sua', 'nosso',
    'nossa', 'dele', 'dela', 'deles', 'delas', 'eu', 'tu', 'ele', 'ela', 'nós', 'vós',
    'eles', 'elas', 'você', 'vocês', 'me', 'te', 'se', 'nos', 'vos', 'lhe', 'lhes',
    'ser', 'estar', 'ter', 'haver', 'fazer', 'ir', 'vir', 'poder', 'dever', 'querer',
    'é', 'são', 'foi', 'eram', 'será', 'seria', 'tem', 'tinha', 'terá', 'teria'
  ]);
  
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Max 10 keywords
}

// Export function to find matching FAQ
export async function findMatchingFaq(agentId: string, userMessage: string): Promise<{ faq: any; score: number } | null> {
  try {
    const result = await query(
      `SELECT * FROM agent_faqs WHERE agent_id = $1 AND is_active = true`,
      [agentId]
    );
    
    if (result.rows.length === 0) return null;
    
    const userKeywords = extractKeywords(userMessage);
    const userWords = new Set(userKeywords);
    
    let bestMatch: { faq: any; score: number } | null = null;
    
    for (const faq of result.rows) {
      // Check keywords match
      const faqKeywords = faq.keywords || [];
      const keywordMatches = faqKeywords.filter((kw: string) => userWords.has(kw)).length;
      
      // Check question similarity (simple word overlap)
      const faqQuestionWords = new Set(extractKeywords(faq.question));
      const questionMatches = [...userWords].filter(w => faqQuestionWords.has(w)).length;
      
      // Calculate score (weighted)
      const score = (keywordMatches * 2) + questionMatches;
      const threshold = Math.max(2, Math.floor(userKeywords.length * 0.5)); // At least 50% match
      
      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { faq, score };
      }
    }
    
    return bestMatch;
  } catch (error) {
    console.error('Error finding matching FAQ:', error);
    return null;
  }
}

// Log FAQ usage
export async function logFaqUsage(faqId: string, agentId: string, sessionId?: string, source: string = 'widget') {
  try {
    // Increment usage count
    await query(
      `UPDATE agent_faqs SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [faqId]
    );
    
    // Log the usage
    await query(
      `INSERT INTO faq_usage_log (faq_id, agent_id, session_id, source) VALUES ($1, $2, $3, $4)`,
      [faqId, agentId, sessionId || null, source]
    );
  } catch (error) {
    console.error('Error logging FAQ usage:', error);
  }
}
