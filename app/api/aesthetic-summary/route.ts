import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `Here is a list of per-photo analysis JSON objects from an Instagram feed. Summarize the overall aesthetic across all of them and return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "tags": ["short readable tag", "another tag"],
  "description": "one-sentence description of the overall aesthetic"
}

Tags should be short and readable, e.g. "warm", "high contrast", "environmental", "candid".

Analysis data:
`;

export async function POST(req: NextRequest) {
  try {
    const { analyses } = await req.json();

    if (!Array.isArray(analyses) || analyses.length === 0) {
      return NextResponse.json({ error: "No analyses provided" }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: PROMPT + JSON.stringify(analyses, null, 2),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
