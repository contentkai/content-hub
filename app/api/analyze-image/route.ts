import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";

const PROMPT = `Analyze this photo and return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "palette": ["color1", "color2"],
  "brightness": "dark|medium|bright",
  "warmth": "cool|neutral|warm",
  "composition": "description",
  "subject_type": "portrait|landscape|detail|other",
  "mood": "one or two words"
}`;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mediaType = file.type as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");

  return NextResponse.json({ result: textBlock?.text ?? "" });
}
