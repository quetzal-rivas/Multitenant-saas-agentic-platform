import { NextRequest, NextResponse } from 'next/server';
import { conversationsManager } from '@/Backend/conversations-manager';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const conversation = conversationsManager.getConversationByThreadId(threadId);

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: `Conversation with threadId "${threadId}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to get conversation' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    const body = await req.json();

    if (body.action === 'add_tool') {
      const updated = conversationsManager.addToolExecution(threadId, body.tool);
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Thread not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, conversation: updated });
    }

    if (body.action === 'update_status') {
      const updated = conversationsManager.updateStatus(threadId, body.status);
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Thread not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, conversation: updated });
    }

    // Default action: add message
    const message = body.message || body;
    if (!message.content || !message.role) {
      return NextResponse.json(
        { success: false, error: 'Message content and role are required' },
        { status: 400 }
      );
    }

    const updated = conversationsManager.addMessage(threadId, message);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Thread "${threadId}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update conversation' },
      { status: 500 }
    );
  }
}
