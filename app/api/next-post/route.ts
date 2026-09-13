import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are picking the next photo to post to an Instagram account from a set of candidate photos, based on how well each one would sit in the actual grid next to the account's most recent posts, and how well it fits the account's overall aesthetic.

Overall aesthetic profile:
`;

const INSTRUCTIONS = `

Instructions:
1. Pick the single best candidate by reasoning specifically about how it would sit next to the 3 most recent posts listed above (grid_position 1 is the most recent) — consider color, tone, and composition contrast or repetition with those actual neighbors, not just the general aesthetic profile.
2. Return a one-sentence "why" explaining the choice in plain, specific language that can reference the actual recent posts (e.g. "your last post was a close-up portrait, this adds environmental space") — not generic praise.
3. If none of the candidates are a good fit next to these recent posts, say so explicitly instead of forcing a pick.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "recommend": true or false,
  "photo_id": "the id of the chosen photo as a string, or null if recommend is false",
  "why": "one-sentence specific reason for the choice, or empty string if recommend is false",
  "reason": "null if recommend is true, otherwise a one-sentence explanation of why nothing fits"
}`;

export async function POST(req: NextRequest) {
  const { candidates, aestheticProfile, recentPosts } = await req.json();

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return NextResponse.json({ error: "No candidate photos provided" }, { status: 400 });
  }

  const prompt =
    PROMPT +
    JSON.stringify(aestheticProfile, null, 2) +
    "\n\n3 most recent posts in the grid (grid_position 1 = most recent):\n" +
    JSON.stringify(recentPosts, null, 2) +
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
