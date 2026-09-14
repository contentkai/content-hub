import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are reviewing an Instagram account's grid and its pool of candidate photos.

The 6 most recent posts in the grid (grid_position 1 = most recent):
`;

const INSTRUCTIONS = `

Instructions:
1. Identify specific patterns that are repetitive or unbalanced in the current grid (e.g. "4 of your last 6 posts are close-up portraits"), grounded in the actual analysis data — not generic advice.
2. Fill up to 6 grid slots, one at a time, in order from slot 1 to slot 6. This is a SEQUENTIAL, DEPENDENT process, not 6 independent picks — reason through it in this exact order:
   - Slot 1's context is the 3 most recent existing_feed posts listed above (grid_position 1 = most recent).
   - Slot 2's context is those same 3 existing_feed posts, PLUS whichever candidate you chose for slot 1 — treat that chosen candidate as if it is now the most recent post, ahead of the real existing_feed photos.
   - Slot 3's context is the existing_feed posts PLUS whatever you chose for slots 1 and 2.
   - Continue this pattern through slot 6: each slot's choice must react to every candidate already "placed" ahead of it (avoiding repetition with them, building rhythm against them), not just to the static existing feed.
   - Stop early (using fewer than 6 slots) once no remaining candidate is a genuine improvement over doing nothing — never force a weak pick just to fill all 6.
3. For any candidates that don't earn a slot, explain why they're being left out rather than forced in — a specific reason grounded in the data.
4. If none of the candidates help the grid at all, leave suggested_order empty and instead provide a shot list of 2-4 short, concrete ideas for what to shoot next to address the issues you identified (e.g. "a wide shot with lots of sky", "a candid action shot", "a close-up detail with cooler tones"). If candidates were used, leave shot_list empty.

IMPORTANT: every "reason" field (in suggested_order and left_out) must be exactly ONE concise sentence — a single clause, not multiple clauses joined by "and"/"while"/em-dashes/semicolons. Keep the whole response tight; do not pad with extra detail beyond what's needed to make the point.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "issues": ["specific issue grounded in the data", "another specific issue"],
  "suggested_order": [{"photo_id": "id as string", "reason": "one-sentence reason for this position"}],
  "left_out": [{"photo_id": "id as string", "reason": "one-sentence reason it doesn't earn a spot"}],
  "shot_list": ["short concrete shot idea"]
}`;

const TARGET_INSTRUCTION = `

Favor candidates that move the feed closer to the target aesthetic, while still fitting reasonably with the recent posts — don't force a jarring mismatch even if it's closer to the target.`;

export async function POST(req: NextRequest) {
  try {
    const { recentPosts, candidates, aestheticProfile, targetAestheticProfile } = await req.json();

    if (!Array.isArray(recentPosts) || recentPosts.length === 0) {
      return NextResponse.json({ error: "No recent posts provided" }, { status: 400 });
    }
    if (!Array.isArray(candidates)) {
      return NextResponse.json({ error: "No candidates provided" }, { status: 400 });
    }

    let prompt = PROMPT + JSON.stringify(recentPosts, null, 2);

    if (aestheticProfile) {
      prompt += "\n\nCurrent overall aesthetic profile:\n" + JSON.stringify(aestheticProfile, null, 2);
    }

    prompt += "\n\nCandidate photos available to post:\n" + JSON.stringify(candidates, null, 2);

    if (targetAestheticProfile) {
      prompt +=
        "\n\nTarget aesthetic the account is moving toward:\n" +
        JSON.stringify(targetAestheticProfile, null, 2);
    }

    prompt += INSTRUCTIONS;

    if (targetAestheticProfile) {
      prompt += TARGET_INSTRUCTION;
    }

    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
