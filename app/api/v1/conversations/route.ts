import { NextRequest, NextResponse } from 'next/server';
import { conversationsManager } from '@/Backend/conversations-manager';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('q') || searchParams.get('search') || undefined;
    const threadId = searchParams.get('threadId') || undefined;

    const list = conversationsManager.getAllConversations({
      type,
      status,
      search,
      threadId,
    });

    return NextResponse.json({
      success: true,
      total: list.length,
      conversations: list,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list conversations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.threadId || !body.title || !body.type) {
      return NextResponse.json(
        { success: false, error: 'threadId, title, and type are required' },
        { status: 400 }
      );
    }

    const conversation = conversationsManager.createConversation(body);

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create conversation' },
      { status: 500 }
    );
  }
}
