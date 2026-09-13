import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `Here are existing Instagram captions written by an account owner.

Analyze their writing voice across these dimensions: sentence length, vocabulary, tone (playful/serious/sarcastic), emoji use, capitalization habits, and whether captions tend to describe the photo or say something unrelated.

Write a concise, plain-text summary covering each of these aspects — no JSON, no markdown headers, just clear prose a caption writer could use as a style guide. Ground every observation in the actual captions below, not generic advice.

Captions:
`;

export async function POST(req: NextRequest) {
  try {
    const { captions } = await req.json();

    if (!Array.isArray(captions) || captions.length === 0) {
      return NextResponse.json({ error: "No captions provided" }, { status: 400 });
    }

    const prompt = PROMPT + captions.map((c, i) => `${i + 1}. "${c}"`).join("\n");

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
