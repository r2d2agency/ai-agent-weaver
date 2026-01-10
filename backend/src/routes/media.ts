import { Router } from 'express';
import { query } from '../services/database.js';

export const mediaRouter = Router();

// Get all media for an agent
mediaRouter.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT * FROM agent_media WHERE agent_id = $1 ORDER BY created_at DESC`,
      [agentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// Upload media (image, gallery, or video) - stores URLs (assumes files are already hosted)
mediaRouter.post('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { mediaType, name, description, fileUrls, fileSizes, mimeTypes } = req.body;
    
    if (!name || !description || !fileUrls || !Array.isArray(fileUrls) || fileUrls.length === 0) {
      return res.status(400).json({ error: 'Name, description, and at least one fileUrl are required' });
    }
    
    if (mediaType === 'gallery' && fileUrls.length > 4) {
      return res.status(400).json({ error: 'Gallery can have at most 4 images' });
    }
    
    if (mediaType === 'image' && fileUrls.length > 1) {
      return res.status(400).json({ error: 'Single image can only have 1 file' });
    }
    
    const result = await query(
      `INSERT INTO agent_media (agent_id, media_type, name, description, file_urls, file_sizes, mime_types) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [agentId, mediaType, name, description, fileUrls, fileSizes || [], mimeTypes || []]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// Upload media with base64 files (converts to data URLs for simplicity)
mediaRouter.post('/agent/:agentId/upload', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { mediaType, name, description, files } = req.body;
    
    if (!name || !description || !files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Name, description, and at least one file are required' });
    }
    
    if (mediaType === 'gallery' && files.length > 4) {
      return res.status(400).json({ error: 'Gallery can have at most 4 images' });
    }
    
    if ((mediaType === 'image' || mediaType === 'video' || mediaType === 'document') && files.length > 1) {
      return res.status(400).json({ error: 'Single image/video/document can only have 1 file' });
    }
    
    // Convert base64 to data URLs
    const fileUrls: string[] = [];
    const fileSizes: number[] = [];
    const mimeTypes: string[] = [];
    
    for (const file of files) {
      const { base64, mimeType, size } = file;
      fileUrls.push(`data:${mimeType};base64,${base64}`);
      fileSizes.push(size || 0);
      mimeTypes.push(mimeType);
    }
    
    const result = await query(
      `INSERT INTO agent_media (agent_id, media_type, name, description, file_urls, file_sizes, mime_types) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [agentId, mediaType, name, description, fileUrls, fileSizes, mimeTypes]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// Delete media
mediaRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `DELETE FROM agent_media WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Update media description
mediaRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    const result = await query(
      `UPDATE agent_media 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description)
       WHERE id = $3 
       RETURNING *`,
      [name, description, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: 'Failed to update media' });
  }
});
