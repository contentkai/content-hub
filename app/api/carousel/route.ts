import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are building an Instagram carousel post from a set of candidate photos.

Instructions:
1. Pick which of these photos actually belong together as a cohesive carousel — it's fine to drop some if they don't fit.
2. Order the remaining photos into the strongest sequence: a strong opener, visual rhythm (avoid two visually similar photos back to back — vary wide/close, warm/cool, people/environment), and an intentional closer.
3. For each photo in the sequence, give a short one-sentence reason for its position (e.g. "moved to slide 4 to break up two high-energy shots in a row"), grounded in the actual analysis data — not generic praise.
4. For any dropped photo, give a short one-sentence reason it doesn't belong with the rest.

Candidate photos:
`;

const INSTRUCTIONS = `

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "sequence": [{"photo_id": "id as string", "reason": "one-sentence reason for this position"}],
  "dropped": [{"photo_id": "id as string", "reason": "one-sentence reason it was left out"}]
}`;

export async function POST(req: NextRequest) {
  const { photos } = await req.json();

  if (!Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  }

  const prompt = PROMPT + JSON.stringify(photos, null, 2) + INSTRUCTIONS;

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");

  return NextResponse.json({ result: textBlock?.text ?? "" });
}
