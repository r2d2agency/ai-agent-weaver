import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { webhookRouter } from './routes/webhook.js';
import { agentsRouter } from './routes/agents.js';
import { messagesRouter } from './routes/messages.js';
import { settingsRouter } from './routes/settings.js';
import { initDatabase } from './services/database.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/webhook', webhookRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/settings', settingsRouter);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
