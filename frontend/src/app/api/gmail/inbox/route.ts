import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMessages, getThread } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated. Please sign in with Gmail.' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const threadId = searchParams.get('threadId');
    const query = searchParams.get('query');
    const maxResults = parseInt(searchParams.get('maxResults') || '20');

    // If threadId is provided, fetch that specific thread
    if (threadId) {
      const result = await getThread(session.accessToken, threadId);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ messages: result.messages, isThread: true });
    }

    // Otherwise, search inbox
    // Default query to find dealer-related emails
    const searchQuery = query || 'subject:(truck OR tundra OR f-150 OR price OR quote OR OTD)';

    const result = await getMessages(session.accessToken, searchQuery, maxResults);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ messages: result.messages });
  } catch (error) {
    console.error('Error in inbox endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
