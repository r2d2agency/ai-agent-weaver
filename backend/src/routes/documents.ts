import { Router } from 'express';
import { query } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';

export const documentsRouter = Router();

// Parse PDF and extract text
async function extractTextFromPDF(base64Data: string): Promise<string> {
  try {
    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParse = (await import('pdf-parse')).default;
    
    const buffer = Buffer.from(base64Data, 'base64');
    const data = await pdfParse(buffer);
    
    return data.text || '';
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF');
  }
}

// Get documents for an agent
documentsRouter.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT * FROM documents WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Get all documents
documentsRouter.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, a.name as agent_name 
       FROM documents d 
       LEFT JOIN agents a ON d.agent_id = a.id 
       ORDER BY d.created_at DESC`
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload document for an agent (content as text)
documentsRouter.post('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, type, size, content } = req.body;
    
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }
    
    const result = await query(
      `INSERT INTO documents (agent_id, name, type, size, content) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [agentId, name, type || 'text/plain', size || content.length, content]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Upload PDF and extract text for RAG training
documentsRouter.post('/agent/:agentId/pdf', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, base64Data } = req.body;
    
    if (!name || !base64Data) {
      return res.status(400).json({ error: 'Name and base64Data are required' });
    }
    
    console.log(`Processing PDF "${name}" for agent ${agentId}...`);
    
    // Extract text from PDF
    const extractedText = await extractTextFromPDF(base64Data);
    
    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'Could not extract text from PDF. The file may be empty or image-only.' });
    }
    
    console.log(`Extracted ${extractedText.length} characters from PDF`);
    
    // Save extracted text as document
    const result = await query(
      `INSERT INTO documents (agent_id, name, type, size, content) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [agentId, name, 'application/pdf', extractedText.length, extractedText]
    );
    
    res.status(201).json({
      ...result.rows[0],
      extractedCharacters: extractedText.length,
      message: `PDF processado com sucesso! ${extractedText.length} caracteres extraídos.`
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).json({ error: 'Failed to process PDF: ' + (error instanceof Error ? error.message : 'Unknown error') });
  }
});

// Delete document
documentsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `DELETE FROM documents WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Update document content
documentsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content } = req.body;
    
    const result = await query(
      `UPDATE documents 
       SET name = COALESCE($1, name), 
           content = COALESCE($2, content)
       WHERE id = $3 
       RETURNING *`,
      [name, content, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});
