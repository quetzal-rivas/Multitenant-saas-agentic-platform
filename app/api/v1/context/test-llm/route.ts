export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(req: NextRequest) {
  try {
    const { contextContent, userQuery, modelName = 'gemini-3.7-flash' } = await req.json();

    if (!contextContent) {
      return NextResponse.json(
        { error: 'MissingContext', message: 'No compiled context provided' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback simulated response if key is temporarily unconfigured in test environment
      return NextResponse.json({
        model: modelName,
        response: `[Simulated Gemini Response]: Based on your compiled context (Sarah Jenkins, Diamond Premier Club, 485,000 points balance, and active contract CTR-9281), I have prepared a tailored retention package for the Cabo San Lucas Esperanza Villa for Thanksgiving week. We have applied the 15% VIP waiver and credited 50,000 complimentary rollover points without any maintenance fee assessment.`,
        tokenUsage: {
          promptTokens: Math.ceil(contextContent.length / 3.8),
          completionTokens: 85,
        },
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = `=== COMPILED CONTEXT PROVIDED BY CONTEXT CONTROL ===\n${contextContent}\n\n=== RUNTIME QUERY / USER UTTERANCE ===\n${userQuery || 'Analyze the situation, address the user by name with their account context, and provide the optimal next response according to guidelines.'}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: promptText,
    });

    return NextResponse.json({
      model: modelName,
      response: response.text || 'No response generated.',
      tokenUsage: {
        promptTokens: Math.ceil(contextContent.length / 3.8),
        completionTokens: Math.ceil((response.text?.length || 0) / 3.8),
      },
    });
  } catch (err: any) {
    console.error('Gemini test execution failed:', err);
    return NextResponse.json(
      {
        error: 'ModelExecutionError',
        message: err.message || 'Failed to execute model with compiled context',
      },
      { status: 500 }
    );
  }
}
