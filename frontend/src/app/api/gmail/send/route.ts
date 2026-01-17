import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sendEmail } from '@/lib/gmail';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '..', 'truck_deals.db');

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in with Gmail.' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { to, subject, htmlBody, listingId, dealerName } = body;

    if (!to || !subject || !htmlBody) {
      return NextResponse.json(
        { error: 'Missing required fields: to, subject, htmlBody' },
        { status: 400 }
      );
    }

    // Send email via Gmail API
    const result = await sendEmail(session.accessToken, to, subject, htmlBody);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    // Store communication in database
    try {
      const db = new Database(DB_PATH);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO email_communications
        (listing_id, dealer_name, dealer_email, gmail_thread_id, gmail_message_id,
         subject, body, direction, sent_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, 'sent', ?)
      `).run(
        listingId || null,
        dealerName || null,
        to,
        result.threadId || null,
        result.messageId || null,
        subject,
        htmlBody,
        now,
        now
      );

      db.close();
    } catch (dbError) {
      console.error('Error saving communication to database:', dbError);
      // Don't fail the request if DB save fails - email was already sent
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error('Error in send email endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
