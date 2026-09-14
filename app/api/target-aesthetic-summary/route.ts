import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `Here is a list of per-photo analysis JSON objects for a set of inspiration photos representing a target aesthetic an Instagram account wants to move toward. Summarize the target look in ONE concise sentence and return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "summary": "one concise sentence capturing the target look"
}

Analysis data:
`;

export async function POST(req: NextRequest) {
  try {
    const { analyses } = await req.json();

    if (!Array.isArray(analyses) || analyses.length === 0) {
      return NextResponse.json({ error: "No analyses provided" }, { status: 400 });
    }

    const prompt = PROMPT + JSON.stringify(analyses, null, 2);

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
