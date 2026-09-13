import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `You are helping sharpen an Instagram account's aesthetic profile by asking the user simple, plain-language either/or questions about their visual taste.

Here are all photos available (each with an id and its vision analysis):
`;

const INSTRUCTIONS = `

Instructions:
1. Identify ONE specific visual axis that is currently ambiguous or under-specified in the aesthetic profile (e.g. warm vs cool light, busy vs minimal composition, posed vs candid, close-up vs environmental). Pick something that would genuinely sharpen the profile if resolved — not a random or already-obvious axis, and not an axis already settled by a prior answer below.
2. Select two actual photo ids from the set above that clearly represent opposite ends of that axis.
3. Phrase a short, plain question a person would understand at a glance (e.g. "Which feels more like your feed?").
4. If nothing meaningfully ambiguous remains given the prior answers, return { "done": true } instead of a question.

Return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "done": false,
  "axis": "short name for the visual axis, e.g. warm vs cool light",
  "question": "short plain question",
  "photo_a_id": "id as string",
  "photo_b_id": "id as string"
}

Or, if nothing meaningfully ambiguous remains:
{ "done": true }`;

export async function POST(req: NextRequest) {
  try {
    const { photos, aestheticProfile, priorAnswers } = await req.json();

    if (!Array.isArray(photos) || photos.length < 2) {
      return NextResponse.json({ error: "Not enough photos with analysis to compare" }, { status: 400 });
    }

    let prompt = PROMPT + JSON.stringify(photos, null, 2);

    prompt +=
      "\n\nCurrent aesthetic profile:\n" +
      (aestheticProfile ? JSON.stringify(aestheticProfile, null, 2) : "none available yet");

    prompt +=
      "\n\nPrior preference answers (axes already resolved — don't repeat these):\n" +
      (Array.isArray(priorAnswers) && priorAnswers.length > 0
        ? JSON.stringify(priorAnswers, null, 2)
        : "none yet");

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
