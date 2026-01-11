import { query } from './database.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Helper: Get valid access token (refresh if needed)
export async function getValidCalendarToken(agentId: string): Promise<string | null> {
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
        console.error('Failed to refresh calendar token');
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
    console.error('Error getting valid calendar token:', error);
    return null;
  }
}

// Check if calendar is enabled for agent
export async function isCalendarEnabled(agentId: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT calendar_enabled FROM agents WHERE id = $1`,
      [agentId]
    );
    return result.rows.length > 0 && result.rows[0].calendar_enabled === true;
  } catch {
    return false;
  }
}

// List events from Google Calendar
export async function listCalendarEvents(
  agentId: string,
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 10
): Promise<{ success: boolean; events?: any[]; error?: string }> {
  try {
    const accessToken = await getValidCalendarToken(agentId);
    if (!accessToken) {
      return { success: false, error: 'Calendário não conectado' };
    }
    
    const params = new URLSearchParams({
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime'
    });
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) {
      return { success: false, error: 'Erro ao buscar eventos' };
    }
    
    const data = await response.json();
    return { success: true, events: data.items || [] };
  } catch (error) {
    console.error('Error listing calendar events:', error);
    return { success: false, error: 'Erro ao conectar com o calendário' };
  }
}

// Create event in Google Calendar
export async function createCalendarEvent(
  agentId: string,
  summary: string,
  startDateTime: string,
  endDateTime: string,
  description?: string
): Promise<{ success: boolean; event?: any; error?: string }> {
  try {
    const accessToken = await getValidCalendarToken(agentId);
    if (!accessToken) {
      return { success: false, error: 'Calendário não conectado' };
    }
    
    const event = {
      summary,
      description,
      start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' }
    };
    
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
      return { success: false, error: 'Erro ao criar evento' };
    }
    
    const createdEvent = await response.json();
    return { success: true, event: createdEvent };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return { success: false, error: 'Erro ao criar evento no calendário' };
  }
}

// Update event in Google Calendar
export async function updateCalendarEvent(
  agentId: string,
  eventId: string,
  updates: { summary?: string; description?: string; startDateTime?: string; endDateTime?: string }
): Promise<{ success: boolean; event?: any; error?: string }> {
  try {
    const accessToken = await getValidCalendarToken(agentId);
    if (!accessToken) {
      return { success: false, error: 'Calendário não conectado' };
    }
    
    // First get the existing event
    const getResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!getResponse.ok) {
      return { success: false, error: 'Evento não encontrado' };
    }
    
    const existingEvent = await getResponse.json();
    
    // Merge updates
    const updatedEvent: any = {
      ...existingEvent,
      summary: updates.summary || existingEvent.summary,
      description: updates.description !== undefined ? updates.description : existingEvent.description
    };
    
    if (updates.startDateTime) {
      updatedEvent.start = { dateTime: updates.startDateTime, timeZone: 'America/Sao_Paulo' };
    }
    if (updates.endDateTime) {
      updatedEvent.end = { dateTime: updates.endDateTime, timeZone: 'America/Sao_Paulo' };
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
      return { success: false, error: 'Erro ao atualizar evento' };
    }
    
    const result = await response.json();
    return { success: true, event: result };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return { success: false, error: 'Erro ao atualizar evento no calendário' };
  }
}

// Delete event from Google Calendar
export async function deleteCalendarEvent(
  agentId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getValidCalendarToken(agentId);
    if (!accessToken) {
      return { success: false, error: 'Calendário não conectado' };
    }
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (!response.ok && response.status !== 204) {
      return { success: false, error: 'Erro ao excluir evento' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return { success: false, error: 'Erro ao excluir evento do calendário' };
  }
}

// Check availability (find free slots)
export async function checkCalendarAvailability(
  agentId: string,
  date: string // YYYY-MM-DD format
): Promise<{ success: boolean; busySlots?: { start: string; end: string }[]; error?: string }> {
  try {
    const accessToken = await getValidCalendarToken(agentId);
    if (!accessToken) {
      return { success: false, error: 'Calendário não conectado' };
    }
    
    // Get events for the specified date
    const startOfDay = `${date}T00:00:00-03:00`;
    const endOfDay = `${date}T23:59:59-03:00`;
    
    const params = new URLSearchParams({
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: 'true',
      orderBy: 'startTime'
    });
    
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) {
      return { success: false, error: 'Erro ao verificar disponibilidade' };
    }
    
    const data = await response.json();
    const busySlots = (data.items || []).map((event: any) => ({
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      summary: event.summary
    }));
    
    return { success: true, busySlots };
  } catch (error) {
    console.error('Error checking calendar availability:', error);
    return { success: false, error: 'Erro ao verificar disponibilidade' };
  }
}
