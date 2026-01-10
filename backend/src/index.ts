import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { webhookRouter } from './routes/webhook.js';
import { agentsRouter } from './routes/agents.js';
import { messagesRouter } from './routes/messages.js';
import { settingsRouter } from './routes/settings.js';
import { authRouter } from './routes/auth.js';
import { widgetRouter } from './routes/widget.js';
import { documentsRouter } from './routes/documents.js';
import { conversationsRouter } from './routes/conversations.js';
import { mediaRouter } from './routes/media.js';
import { faqRouter } from './routes/faq.js';
import { initDatabase } from './services/database.js';
import { startInactivityChecker } from './services/inactivity.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/webhook', webhookRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/auth', authRouter);
app.use('/api/widget', widgetRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/faq', faqRouter);

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Start background job for inactivity checking
    startInactivityChecker();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
