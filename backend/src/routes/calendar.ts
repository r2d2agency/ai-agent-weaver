import { Router } from 'express';
import { query } from '../services/database.js';

export const calendarRouter = Router();

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/calendar/callback';

// Scopes for Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
].join(' ');

// Get OAuth URL for agent
calendarRouter.get('/auth-url/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Google OAuth not configured. Please set GOOGLE_CLIENT_ID.' });
    }
    
    // State includes agentId for callback routing
    const state = Buffer.from(JSON.stringify({ agentId })).toString('base64');
    
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    
    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// OAuth callback
calendarRouter.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      return res.redirect(`/agents?calendar_error=${encodeURIComponent(error as string)}`);
    }
    
    if (!code || !state) {
      return res.redirect('/agents?calendar_error=Missing code or state');
    }
    
    // Decode state to get agentId
    let agentId: string;
    try {
      const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      agentId = stateData.agentId;
    } catch {
      return res.redirect('/agents?calendar_error=Invalid state');
    }
    
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange error:', errorData);
      return res.redirect(`/agents/${agentId}?calendar_error=Token exchange failed`);
    }
    
    const tokens = await tokenResponse.json();
    
    // Get user email for display
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    
    let email = '';
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      email = userInfo.email || '';
    }
    
    // Save tokens to database
    await query(
      `INSERT INTO agent_calendar_tokens (agent_id, access_token, refresh_token, expires_at, google_email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, agent_calendar_tokens.refresh_token),
         expires_at = EXCLUDED.expires_at,
         google_email = EXCLUDED.google_email,
         updated_at = CURRENT_TIMESTAMP`,
      [
        agentId,
        tokens.access_token,
        tokens.refresh_token,
        new Date(Date.now() + tokens.expires_in * 1000),
        email
      ]
    );
    
    // Update agent to enable calendar
    await query(
      `UPDATE agents SET calendar_enabled = true WHERE id = $1`,
      [agentId]
    );
    
    res.redirect(`/agents/${agentId}?calendar_success=true`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/agents?calendar_error=Callback failed');
  }
});

// Get calendar connection status for agent
calendarRouter.get('/status/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    const result = await query(
      `SELECT google_email, expires_at, updated_at FROM agent_calendar_tokens WHERE agent_id = $1`,
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }
    
    const token = result.rows[0];
    res.json({
      connected: true,
      email: token.google_email,
      expiresAt: token.expires_at,
      updatedAt: token.updated_at
    });
  } catch (error) {
    console.error('Error getting calendar status:', error);
    res.status(500).json({ error: 'Failed to get calendar status' });
  }
});

// Disconnect calendar from agent
calendarRouter.delete('/disconnect/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    
    // Delete tokens
    await query(`DELETE FROM agent_calendar_tokens WHERE agent_id = $1`, [agentId]);
    
    // Disable calendar on agent
    await query(`UPDATE agents SET calendar_enabled = false WHERE id = $1`, [agentId]);
    
    res.json({ success: true, message: 'Calendar disconnected' });
  } catch (error) {
    console.error('Error disconnecting calendar:', error);
    res.status(500).json({ error: 'Failed to disconnect calendar' });
  }
});

// List events
calendarRouter.get('/events/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { timeMin, timeMax, maxResults } = req.query;
    
    const accessToken = await getValidAccessToken(agentId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Calendar not connected or token expired' });
    }
    
    const params = new URLSearchParams({
      timeMin: (timeMin as string) || new Date().toISOString(),
      timeMax: (timeMax as string) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: (maxResults as string) || '50',
      singleEvents: 'true',
      orderBy: 'startTime'
    });
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Calendar API error:', error);
      return res.status(response.status).json({ error: 'Failed to fetch events' });
    }
    
    const data = await response.json();
    res.json(data.items || []);
  } catch (error) {
    console.error('Error listing events:', error);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

// Create event
calendarRouter.post('/events/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { summary, description, startDateTime, endDateTime, attendees } = req.body;
    
    const accessToken = await getValidAccessToken(agentId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Calendar not connected or token expired' });
    }
    
    const event: any = {
      summary,
      description,
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' }
    };
    
    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map((email: string) => ({ email }));
    }
    
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Calendar API error:', error);
      return res.status(response.status).json({ error: 'Failed to create event' });
    }
    
    const createdEvent = await response.json();
    res.json(createdEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
calendarRouter.put('/events/:agentId/:eventId', async (req, res) => {
  try {
    const { agentId, eventId } = req.params;
    const { summary, description, startDateTime, endDateTime } = req.body;
    
    const accessToken = await getValidAccessToken(agentId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Calendar not connected or token expired' });
    }
    
    // First get the existing event
    const getResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!getResponse.ok) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const existingEvent = await getResponse.json();
    
    // Merge updates
    const updatedEvent: any = {
      ...existingEvent,
      summary: summary || existingEvent.summary,
      description: description !== undefined ? description : existingEvent.description
    };
    
    if (startDateTime) {
      updatedEvent.start = { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' };
    }
    if (endDateTime) {
      updatedEvent.end = { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' };
    }
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedEvent)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Calendar API error:', error);
      return res.status(response.status).json({ error: 'Failed to update event' });
    }
    
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
calendarRouter.delete('/events/:agentId/:eventId', async (req, res) => {
  try {
    const { agentId, eventId } = req.params;
    
    const accessToken = await getValidAccessToken(agentId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Calendar not connected or token expired' });
    }
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (!response.ok && response.status !== 204) {
      const error = await response.text();
      console.error('Calendar API error:', error);
      return res.status(response.status).json({ error: 'Failed to delete event' });
    }
    
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Helper: Get valid access token (refresh if needed)
async function getValidAccessToken(agentId: string): Promise<string | null> {
  try {
    const result = await query(
      `SELECT access_token, refresh_token, expires_at FROM agent_calendar_tokens WHERE agent_id = $1`,
      [agentId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const token = result.rows[0];
    const expiresAt = new Date(token.expires_at);
    
    // If token expires in less than 5 minutes, refresh it
    if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
      if (!token.refresh_token) {
        console.error('No refresh token available');
        return null;
      }
      
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          refresh_token: token.refresh_token,
          grant_type: 'refresh_token'
        })
      });
      
      if (!refreshResponse.ok) {
        console.error('Failed to refresh token');
        return null;
      }
      
      const newTokens = await refreshResponse.json();
      
      // Update stored token
      await query(
        `UPDATE agent_calendar_tokens 
         SET access_token = $1, expires_at = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE agent_id = $3`,
        [newTokens.access_token, new Date(Date.now() + newTokens.expires_in * 1000), agentId]
      );
      
      return newTokens.access_token;
    }
    
    return token.access_token;
  } catch (error) {
    console.error('Error getting valid access token:', error);
    return null;
  }
}

// Export helper for use in openai service
export { getValidAccessToken };
