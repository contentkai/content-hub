import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `Here is the analysis of a photo about to be posted to Instagram:
`;

const INSTRUCTIONS_PREFIX = `

Here is a summary of the account owner's writing voice:
`;

const AVOID_PREFIX = `

These phrases or styles have been explicitly banned — do not use anything resembling them:
`;

const FINAL_INSTRUCTIONS = `

Write 3 different caption options for this photo that sound like the account owner's actual voice described above — not generic Instagram caption style. Vary the approach across the 3 options (e.g. different angles, lengths, or tones within the described voice).

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "captions": ["caption option 1", "caption option 2", "caption option 3"]
}`;

export async function POST(req: NextRequest) {
  try {
    const { photoAnalysis, voiceSummary, avoidPhrases } = await req.json();

    if (!photoAnalysis) {
      return NextResponse.json({ error: "No photo analysis provided" }, { status: 400 });
    }

    let prompt =
      PROMPT +
      JSON.stringify(photoAnalysis, null, 2) +
      INSTRUCTIONS_PREFIX +
      (voiceSummary || "No voice profile available yet — write in a natural, casual Instagram voice.");

    if (Array.isArray(avoidPhrases) && avoidPhrases.length > 0) {
      prompt += AVOID_PREFIX + avoidPhrases.map((p) => `- ${p}`).join("\n");
    }

    prompt += FINAL_INSTRUCTIONS;

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
