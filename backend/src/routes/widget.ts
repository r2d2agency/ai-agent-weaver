import { Router } from 'express';
import { query } from '../services/database.js';
import { generateWidgetResponse } from '../services/openai.js';
import { v4 as uuidv4 } from 'uuid';

export const widgetRouter = Router();

// CORS middleware for widget routes
widgetRouter.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Get agent info for widget (public)
widgetRouter.get('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT id, name, description, widget_avatar_url, widget_position, widget_title, 
              widget_primary_color, widget_secondary_color, widget_background_color, widget_text_color 
       FROM agents WHERE id = $1 AND widget_enabled = true`,
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found or widget not enabled' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching agent for widget:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Chat endpoint for widget
widgetRouter.post('/chat/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { message, sessionId, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get agent
    const agentResult = await query(
      `SELECT * FROM agents WHERE id = $1 AND widget_enabled = true`,
      [agentId]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Agent not found or widget not enabled' });
    }
    
    const agent = agentResult.rows[0];
    const currentSessionId = sessionId || uuidv4();
    
    // Generate response
    const response = await generateWidgetResponse(agent, message, currentSessionId, history || []);
    
    // Save widget message (optional, for analytics)
    try {
      await query(
        `INSERT INTO widget_messages (agent_id, session_id, sender, content) 
         VALUES ($1, $2, 'user', $3)`,
        [agent.id, currentSessionId, message]
      );
      
      await query(
        `INSERT INTO widget_messages (agent_id, session_id, sender, content) 
         VALUES ($1, $2, 'agent', $3)`,
        [agent.id, currentSessionId, response]
      );
    } catch (saveError) {
      // Don't fail if saving messages fails
      console.error('Error saving widget messages:', saveError);
    }
    
    res.json({ 
      response, 
      sessionId: currentSessionId 
    });
  } catch (error) {
    console.error('Widget chat error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Get embed script
widgetRouter.get('/embed/:agentId', async (req, res) => {
  const { agentId } = req.params;
  
  const script = `
(function() {
  var agentId = "${agentId}";
  
  // Resolve API URL from script src to avoid Mixed Content issues
  var scripts = document.getElementsByTagName('script');
  var currentScript = null;
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src && scripts[i].src.indexOf('/api/widget/embed/') !== -1) {
      currentScript = scripts[i];
      break;
    }
  }
  
  var apiUrl = '';
  var customWidth = 380;
  var customHeight = 520;
  
  if (currentScript) {
    // Extract origin from script src
    var srcUrl = currentScript.src;
    var match = srcUrl.match(/^(https?:\\/\\/[^\\/]+)/);
    if (match) {
      apiUrl = match[1];
    }
    // Read data attributes for dimensions
    if (currentScript.getAttribute('data-width')) {
      customWidth = parseInt(currentScript.getAttribute('data-width'), 10) || 380;
    }
    if (currentScript.getAttribute('data-height')) {
      customHeight = parseInt(currentScript.getAttribute('data-height'), 10) || 520;
    }
  }
  
  // Fallback: if we couldn't detect, use window location with https
  if (!apiUrl) {
    console.warn('Widget: Could not detect API URL from script src, using fallback');
    apiUrl = 'https://' + window.location.host;
  }
  
  console.log('Widget initialized - API:', apiUrl, 'Width:', customWidth, 'Height:', customHeight);
  
  // Config (will be loaded from API)
  var config = {
    position: 'right',
    primaryColor: '#667eea',
    secondaryColor: '#764ba2',
    backgroundColor: '#ffffff',
    textColor: '#333333',
    title: 'Assistente',
    avatarUrl: null
  };
  
  function hexToRgba(hex, alpha) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }
  
  function injectStyles() {
    var posLeft = config.position === 'left';
    var styles = document.createElement('style');
    styles.id = 'wa-widget-styles';
    styles.textContent = \`
      .wa-widget-btn {
        position: fixed;
        bottom: 20px;
        \${posLeft ? 'left: 20px;' : 'right: 20px;'}
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, \${config.primaryColor} 0%, \${config.secondaryColor} 100%);
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 15px \${hexToRgba(config.primaryColor, 0.4)};
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        transition: transform 0.3s ease;
        overflow: hidden;
      }
      .wa-widget-btn:hover { transform: scale(1.1); }
      .wa-widget-btn svg { width: 30px; height: 30px; fill: white; }
      .wa-widget-btn img { width: 100%; height: 100%; object-fit: cover; }
      
      .wa-widget-container {
        position: fixed;
        bottom: 90px;
        \${posLeft ? 'left: 20px;' : 'right: 20px;'}
        width: \${customWidth}px;
        height: \${customHeight}px;
        background: \${config.backgroundColor};
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        display: none;
        flex-direction: column;
        z-index: 999999;
        overflow: hidden;
        max-height: calc(100vh - 120px);
      }
      .wa-widget-container.open { display: flex; }
      
      .wa-widget-header {
        background: linear-gradient(135deg, \${config.primaryColor} 0%, \${config.secondaryColor} 100%);
        color: white;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .wa-widget-header-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .wa-widget-header-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .wa-widget-header-info h3 { margin: 0; font-size: 16px; font-weight: 600; }
      .wa-widget-header-info p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
      .wa-widget-close {
        margin-left: auto;
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        font-size: 24px;
        line-height: 1;
      }
      
      .wa-widget-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #f5f5f5;
      }
      .wa-widget-message {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 16px;
        margin-bottom: 8px;
        font-size: 14px;
        line-height: 1.4;
      }
      .wa-widget-message.user {
        background: linear-gradient(135deg, \${config.primaryColor} 0%, \${config.secondaryColor} 100%);
        color: white;
        margin-left: auto;
        border-bottom-right-radius: 4px;
      }
      .wa-widget-message.agent {
        background: \${config.backgroundColor};
        color: \${config.textColor};
        border-bottom-left-radius: 4px;
      }
      .wa-widget-typing {
        display: flex;
        gap: 4px;
        padding: 10px 14px;
        background: \${config.backgroundColor};
        border-radius: 16px;
        width: fit-content;
      }
      .wa-widget-typing span {
        width: 8px;
        height: 8px;
        background: \${config.primaryColor};
        border-radius: 50%;
        animation: typing 1.4s infinite;
      }
      .wa-widget-typing span:nth-child(2) { animation-delay: 0.2s; }
      .wa-widget-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }
      
      .wa-widget-input {
        display: flex;
        padding: 12px;
        gap: 8px;
        border-top: 1px solid #eee;
        background: \${config.backgroundColor};
      }
      .wa-widget-input input {
        flex: 1;
        border: 1px solid #ddd;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        background: \${config.backgroundColor};
        color: \${config.textColor};
      }
      .wa-widget-input input:focus { border-color: \${config.primaryColor}; }
      .wa-widget-input button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, \${config.primaryColor} 0%, \${config.secondaryColor} 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .wa-widget-input button:disabled { opacity: 0.5; cursor: not-allowed; }
      .wa-widget-input button svg { width: 20px; height: 20px; fill: white; }
    \`;
    document.head.appendChild(styles);
  }
  
  function createWidget() {
    var avatarHtml = config.avatarUrl 
      ? '<img src="' + config.avatarUrl + '" alt="Avatar" />'
      : '<svg viewBox="0 0 24 24" width="24" height="24" fill="white"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A2.5 2.5 0 0 0 5 15.5 2.5 2.5 0 0 0 7.5 18a2.5 2.5 0 0 0 2.5-2.5A2.5 2.5 0 0 0 7.5 13m9 0a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>';
    
    var btnContent = config.avatarUrl 
      ? '<img src="' + config.avatarUrl + '" alt="Avatar" />'
      : '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
    
    var container = document.createElement('div');
    container.innerHTML = \`
      <button class="wa-widget-btn" id="wa-widget-toggle">\${btnContent}</button>
      <div class="wa-widget-container" id="wa-widget-container">
        <div class="wa-widget-header">
          <div class="wa-widget-header-avatar">\${avatarHtml}</div>
          <div class="wa-widget-header-info">
            <h3 id="wa-agent-name">\${config.title}</h3>
            <p>Online</p>
          </div>
          <button class="wa-widget-close" id="wa-widget-close">&times;</button>
        </div>
        <div class="wa-widget-messages" id="wa-widget-messages">
          <div class="wa-widget-message agent">Olá! Como posso ajudar você?</div>
        </div>
        <div class="wa-widget-input">
          <input type="text" id="wa-widget-input" placeholder="Digite sua mensagem..." />
          <button id="wa-widget-send">
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>
    \`;
    document.body.appendChild(container);
  }
  
  function initWidget() {
    var sessionId = null;
    var history = [];
    var isLoading = false;
    
    var toggle = document.getElementById('wa-widget-toggle');
    var widget = document.getElementById('wa-widget-container');
    var closeBtn = document.getElementById('wa-widget-close');
    var messages = document.getElementById('wa-widget-messages');
    var input = document.getElementById('wa-widget-input');
    var sendBtn = document.getElementById('wa-widget-send');
    
    toggle.onclick = function() {
      widget.classList.toggle('open');
      if (widget.classList.contains('open')) {
        input.focus();
      }
    };
    
    closeBtn.onclick = function() {
      widget.classList.remove('open');
    };
    
    function addMessage(text, sender) {
      var div = document.createElement('div');
      div.className = 'wa-widget-message ' + sender;
      div.textContent = text;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    
    function showTyping() {
      var div = document.createElement('div');
      div.className = 'wa-widget-typing';
      div.id = 'wa-typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    
    function hideTyping() {
      var typing = document.getElementById('wa-typing');
      if (typing) typing.remove();
    }
    
    function sendMessage() {
      var text = input.value.trim();
      if (!text || isLoading) return;
      
      isLoading = true;
      input.value = '';
      sendBtn.disabled = true;
      
      addMessage(text, 'user');
      history.push({ role: 'user', content: text });
      showTyping();
      
      fetch(apiUrl + '/api/widget/chat/' + agentId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId, history: history })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        hideTyping();
        if (data.response) {
          addMessage(data.response, 'agent');
          history.push({ role: 'assistant', content: data.response });
          sessionId = data.sessionId;
        }
      })
      .catch(function(err) {
        hideTyping();
        addMessage('Desculpe, ocorreu um erro. Tente novamente.', 'agent');
      })
      .finally(function() {
        isLoading = false;
        sendBtn.disabled = false;
      });
    }
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = function(e) {
      if (e.key === 'Enter') sendMessage();
    };
  }
  
  // Load config and initialize
  fetch(apiUrl + '/api/widget/agent/' + agentId)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.widget_position) config.position = data.widget_position;
      if (data.widget_primary_color) config.primaryColor = data.widget_primary_color;
      if (data.widget_secondary_color) config.secondaryColor = data.widget_secondary_color;
      if (data.widget_background_color) config.backgroundColor = data.widget_background_color;
      if (data.widget_text_color) config.textColor = data.widget_text_color;
      if (data.widget_title) config.title = data.widget_title;
      if (data.widget_avatar_url) config.avatarUrl = data.widget_avatar_url;
      if (data.name && !data.widget_title) config.title = data.name;
      
      injectStyles();
      createWidget();
      initWidget();
    })
    .catch(function(err) {
      console.error('Failed to load widget config:', err);
      injectStyles();
      createWidget();
      initWidget();
    });
})();
  `;
  
  res.type('application/javascript').send(script);
});
