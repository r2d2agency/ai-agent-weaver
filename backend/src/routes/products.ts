import { Router } from 'express';
import { query } from '../services/database.js';
import { createLog } from './logs.js';

const productsRouter = Router();

// Get all products for an agent
productsRouter.get('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT * FROM agent_products WHERE agent_id = $1 ORDER BY category, name`,
      [agentId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Create a new product
productsRouter.post('/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { name, description, price, category, sku, stock, is_active } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await query(
      `INSERT INTO agent_products (agent_id, name, description, price, category, sku, stock, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [agentId, name, description || '', parseFloat(price), category || null, sku || null, stock ?? null, is_active !== false]
    );

    await createLog({
      agentId,
      logType: 'info',
      action: 'product_created',
      details: { productName: name, price },
      source: 'system'
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update a product
productsRouter.put('/:agentId/:productId', async (req, res) => {
  try {
    const { agentId, productId } = req.params;
    const { name, description, price, category, sku, stock, is_active } = req.body;

    const result = await query(
      `UPDATE agent_products 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category = $4,
           sku = $5,
           stock = $6,
           is_active = COALESCE($7, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND agent_id = $9
       RETURNING *`,
      [name, description, price !== undefined ? parseFloat(price) : null, category, sku, stock, is_active, productId, agentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
productsRouter.delete('/:agentId/:productId', async (req, res) => {
  try {
    const { agentId, productId } = req.params;

    const result = await query(
      `DELETE FROM agent_products WHERE id = $1 AND agent_id = $2 RETURNING id`,
      [productId, agentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Bulk import products (CSV-like)
productsRouter.post('/:agentId/bulk', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Products array is required' });
    }

    const inserted = [];
    for (const product of products) {
      if (!product.name || product.price === undefined) continue;
      
      const result = await query(
        `INSERT INTO agent_products (agent_id, name, description, price, category, sku, stock)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [agentId, product.name, product.description || '', parseFloat(product.price), product.category || null, product.sku || null, product.stock ?? null]
      );
      inserted.push(result.rows[0]);
    }

    await createLog({
      agentId,
      logType: 'info',
      action: 'products_bulk_import',
      details: { count: inserted.length },
      source: 'system'
    });

    res.status(201).json({ success: true, count: inserted.length, products: inserted });
  } catch (error) {
    console.error('Error bulk importing products:', error);
    res.status(500).json({ error: 'Failed to import products' });
  }
});

export { productsRouter };
