import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are picking the next photo to post to an Instagram account from a set of candidate photos, based on how well each one balances or complements the account's existing aesthetic.

Existing aesthetic profile:
`;

const INSTRUCTIONS = `

Instructions:
1. Pick the single best candidate that balances or complements the existing aesthetic (e.g. if the profile is warm and portrait-heavy, favor a candidate that's cooler or more environmental).
2. Return a one-sentence "why" explaining the choice in plain, specific language grounded in the actual analysis data — not generic praise.
3. If none of the candidates are a good fit, say so explicitly instead of forcing a pick.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "recommend": true or false,
  "photo_id": "the id of the chosen photo as a string, or null if recommend is false",
  "why": "one-sentence specific reason for the choice, or empty string if recommend is false",
  "reason": "null if recommend is true, otherwise a one-sentence explanation of why nothing fits"
}`;

export async function POST(req: NextRequest) {
  const { candidates, aestheticProfile } = await req.json();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: "No candidate photos provided" }, { status: 400 });
  }

  const prompt =
    PROMPT +
    JSON.stringify(aestheticProfile, null, 2) +
    "\n\nCandidate photos:\n" +
    JSON.stringify(candidates, null, 2) +
    INSTRUCTIONS;

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");

  return NextResponse.json({ result: textBlock?.text ?? "" });
}
