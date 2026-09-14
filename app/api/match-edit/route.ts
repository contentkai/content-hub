import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are choosing ONE shared set of photo edit adjustments to apply across an entire Instagram carousel, so every photo in it feels like a single unified, matching set rather than each photo edited individually to look its own best.

Photos in this carousel (analysis for each):
`;

const INSTRUCTIONS = `

Instructions:
Suggest ONE set of edit values on a -10 to +10 scale for: exposure, contrast, saturation, warmth (positive = warmer/more orange, negative = cooler/more blue) that would work reasonably well applied identically across ALL of these photos — not optimized for any single one. Give a one-sentence reason grounded in what actually unifies or needs correcting across the set as a group (e.g. inconsistent warmth between photos, mismatched brightness levels, clashing saturation), not generic praise.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "exposure": number,
  "contrast": number,
  "saturation": number,
  "warmth": number,
  "reason": "one-sentence reason"
}`;

const TARGET_INSTRUCTION = `

Favor values that also move the set closer to the target aesthetic, while still keeping the whole set looking coherent together — don't force a jarring mismatch even if it's closer to the target.`;

export async function POST(req: NextRequest) {
  try {
    const { photos, targetAestheticProfile } = await req.json();

    if (!Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 });
    }

    let prompt = PROMPT + JSON.stringify(photos, null, 2);

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
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");

    return NextResponse.json({ result: textBlock?.text ?? "" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
