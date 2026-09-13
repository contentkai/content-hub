import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import convertHeic from "heic-convert";

const PROMPT = `Analyze this photo and return ONLY valid JSON in this exact shape, with no other text before or after it:
{
  "palette": ["color1", "color2"],
  "brightness": "dark|medium|bright",
  "warmth": "cool|neutral|warm",
  "composition": "description",
  "subject_type": "portrait|landscape|detail|other",
  "mood": "one or two words"
}`;

const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }

    const isHeic =
      file.type === "image/heic" ||
      file.type === "image/heif" ||
      /\.(heic|heif)$/i.test(file.name);

    let base64: string;
    let mediaType: (typeof SUPPORTED_MEDIA_TYPES)[number];

    if (isHeic) {
      const inputBuffer = Buffer.from(await file.arrayBuffer());
      const outputBuffer = await convertHeic({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
      base64 = Buffer.from(outputBuffer).toString("base64");
      mediaType = "image/jpeg";
    } else if (SUPPORTED_MEDIA_TYPES.includes(file.type as (typeof SUPPORTED_MEDIA_TYPES)[number])) {
      base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      mediaType = file.type as (typeof SUPPORTED_MEDIA_TYPES)[number];
    } else {
      return NextResponse.json(
        {
          error: `Unsupported image type "${file.type || "unknown"}". Please upload a JPEG, PNG, GIF, WEBP, or HEIC image.`,
        },
        { status: 400 }
      );
    }

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
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
