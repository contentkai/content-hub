import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are suggesting photo edit adjustments to help a candidate photo better match an Instagram account's aesthetic.

Photo analysis:
`;

const INSTRUCTIONS = `

Instructions:
Suggest edit values on a -10 to +10 scale for: exposure, contrast, saturation, warmth (positive = warmer/more orange, negative = cooler/more blue).
Propose 2 distinct variations — a "subtle match" (smaller adjustments) and a "stronger match" (bolder adjustments) — each with its own one-sentence reason grounded in the actual aesthetic/target data, not generic advice.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "variations": [
    { "label": "subtle match", "exposure": number, "contrast": number, "saturation": number, "warmth": number, "reason": "one-sentence reason" },
    { "label": "stronger match", "exposure": number, "contrast": number, "saturation": number, "warmth": number, "reason": "one-sentence reason" }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { photoAnalysis, aestheticProfile, targetAestheticProfile } = await req.json();

    if (!photoAnalysis) {
      return NextResponse.json({ error: "No photo analysis provided" }, { status: 400 });
    }

    let prompt = PROMPT + JSON.stringify(photoAnalysis, null, 2);

    prompt +=
      "\n\nCurrent aesthetic profile:\n" +
      (aestheticProfile ? JSON.stringify(aestheticProfile, null, 2) : "none available");

    prompt +=
      "\n\nTarget aesthetic profile (if the account is moving toward a new look):\n" +
      (targetAestheticProfile ? JSON.stringify(targetAestheticProfile, null, 2) : "none available");

    prompt += INSTRUCTIONS;

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
