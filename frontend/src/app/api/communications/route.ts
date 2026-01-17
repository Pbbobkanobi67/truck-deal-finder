import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '..', 'truck_deals.db');

interface Communication {
  id: number;
  listing_id: number | null;
  dealer_name: string;
  dealer_email: string | null;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  subject: string | null;
  body: string | null;
  direction: 'sent' | 'received';
  sent_at: string | null;
  received_at: string | null;
  status: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dealerName = searchParams.get('dealerName');
  const listingId = searchParams.get('listingId');

  try {
    const db = new Database(DB_PATH, { readonly: true });

    let query = `
      SELECT ec.*, l.make, l.model, l.year, l.trim
      FROM email_communications ec
      LEFT JOIN listings l ON ec.listing_id = l.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (dealerName) {
      query += ' AND LOWER(ec.dealer_name) LIKE LOWER(?)';
      params.push(`%${dealerName}%`);
    }

    if (listingId) {
      query += ' AND ec.listing_id = ?';
      params.push(parseInt(listingId));
    }

    query += ' ORDER BY ec.created_at DESC';

    const communications = db.prepare(query).all(...params);
    db.close();

    return NextResponse.json(communications);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      listingId,
      dealerName,
      dealerEmail,
      gmailThreadId,
      gmailMessageId,
      subject,
      emailBody,
      direction,
      status,
    } = body;

    if (!dealerName || !direction) {
      return NextResponse.json(
        { error: 'Missing required fields: dealerName, direction' },
        { status: 400 }
      );
    }

    const db = new Database(DB_PATH);
    const now = new Date().toISOString();

    const result = db.prepare(`
      INSERT INTO email_communications
      (listing_id, dealer_name, dealer_email, gmail_thread_id, gmail_message_id,
       subject, body, direction, sent_at, received_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      listingId || null,
      dealerName,
      dealerEmail || null,
      gmailThreadId || null,
      gmailMessageId || null,
      subject || null,
      emailBody || null,
      direction,
      direction === 'sent' ? now : null,
      direction === 'received' ? now : null,
      status || 'sent',
      now
    );

    db.close();

    return NextResponse.json({
      success: true,
      id: result.lastInsertRowid,
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to save communication' },
      { status: 500 }
    );
  }
}
