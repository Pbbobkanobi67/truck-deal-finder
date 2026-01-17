import { google } from 'googleapis';

// Create Gmail API client with access token
export function createGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

// Encode email to base64url format required by Gmail API
function encodeEmail(to: string, from: string, subject: string, body: string): string {
  const email = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Send an email using Gmail API
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  from?: string
): Promise<{ success: boolean; messageId?: string; threadId?: string; error?: string }> {
  try {
    const gmail = createGmailClient(accessToken);

    // Get user's email address if not provided
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = from || profile.data.emailAddress || '';

    const encodedMessage = encodeEmail(to, userEmail, subject, body);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: response.data.id || undefined,
      threadId: response.data.threadId || undefined,
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

// Get messages from inbox (with optional query)
export async function getMessages(
  accessToken: string,
  query?: string,
  maxResults: number = 20
): Promise<{ messages: GmailMessage[]; error?: string }> {
  try {
    const gmail = createGmailClient(accessToken);

    // Search for messages
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query || '',
      maxResults,
    });

    const messageIds = listResponse.data.messages || [];
    const messages: GmailMessage[] = [];

    // Fetch full message details for each
    for (const msg of messageIds.slice(0, maxResults)) {
      if (!msg.id) continue;

      const messageResponse = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const message = messageResponse.data;
      const headers = message.payload?.headers || [];

      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      messages.push({
        id: message.id || '',
        threadId: message.threadId || '',
        snippet: message.snippet || '',
        subject: getHeader('subject'),
        from: getHeader('from'),
        to: getHeader('to'),
        date: getHeader('date'),
        body: extractBody(message.payload),
        labelIds: message.labelIds || [],
      });
    }

    return { messages };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return {
      messages: [],
      error: error instanceof Error ? error.message : 'Failed to fetch messages',
    };
  }
}

// Extract body from message payload
function extractBody(payload: any): string {
  if (!payload) return '';

  // Check for body data directly
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }

  // Check for parts (multipart message)
  if (payload.parts) {
    for (const part of payload.parts) {
      // Prefer text/html, fall back to text/plain
      if (part.mimeType === 'text/html' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      // Recursively check nested parts
      if (part.parts) {
        const nestedBody = extractBody(part);
        if (nestedBody) return nestedBody;
      }
    }
  }

  return '';
}

// Get thread (conversation) by ID
export async function getThread(
  accessToken: string,
  threadId: string
): Promise<{ messages: GmailMessage[]; error?: string }> {
  try {
    const gmail = createGmailClient(accessToken);

    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const messages: GmailMessage[] = (response.data.messages || []).map(message => {
      const headers = message.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      return {
        id: message.id || '',
        threadId: message.threadId || '',
        snippet: message.snippet || '',
        subject: getHeader('subject'),
        from: getHeader('from'),
        to: getHeader('to'),
        date: getHeader('date'),
        body: extractBody(message.payload),
        labelIds: message.labelIds || [],
      };
    });

    return { messages };
  } catch (error) {
    console.error('Error fetching thread:', error);
    return {
      messages: [],
      error: error instanceof Error ? error.message : 'Failed to fetch thread',
    };
  }
}

// Types
export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  labelIds: string[];
}
