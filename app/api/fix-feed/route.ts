import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are reviewing an Instagram account's grid and its pool of candidate photos.

The 6 most recent posts in the grid (grid_position 1 = most recent):
`;

const INSTRUCTIONS = `

Instructions:
1. Identify specific patterns that are repetitive or unbalanced in the current grid (e.g. "4 of your last 6 posts are close-up portraits"), grounded in the actual analysis data — not generic advice.
2. Decide which of the candidate photos (if any) would improve the grid, and propose the best order to slot them in ahead of the existing photos — reason about how each one sits next to the current most-recent posts and next to each other, the same way you would when picking a single next post, but for the whole candidate pool at once. Give a specific one-sentence reason for each candidate's position.
3. For any candidates that don't earn a spot, explain why they're being left out rather than forced in — a specific one-sentence reason grounded in the data.
4. If none of the candidates help the grid, leave suggested_order empty and instead provide a shot list of 2-4 short, concrete ideas for what to shoot next to address the issues you identified (e.g. "a wide shot with lots of sky", "a candid action shot", "a close-up detail with cooler tones"). If candidates were used, leave shot_list empty.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "issues": ["specific issue grounded in the data", "another specific issue"],
  "suggested_order": [{"photo_id": "id as string", "reason": "one-sentence reason for this position"}],
  "left_out": [{"photo_id": "id as string", "reason": "one-sentence reason it doesn't earn a spot"}],
  "shot_list": ["short concrete shot idea"]
}`;

export async function POST(req: NextRequest) {
  try {
    const { recentPosts, candidates } = await req.json();

    if (!Array.isArray(recentPosts) || recentPosts.length === 0) {
      return NextResponse.json({ error: "No recent posts provided" }, { status: 400 });
    }
    if (!Array.isArray(candidates)) {
      return NextResponse.json({ error: "No candidates provided" }, { status: 400 });
    }

    const prompt =
      PROMPT +
      JSON.stringify(recentPosts, null, 2) +
      "\n\nCandidate photos available to post:\n" +
      JSON.stringify(candidates, null, 2) +
      INSTRUCTIONS;

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
