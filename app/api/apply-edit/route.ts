import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function POST(req: NextRequest) {
  try {
    const { photoUrl, exposure, contrast, saturation, warmth } = await req.json();

    if (!photoUrl) {
      return NextResponse.json({ error: "No photoUrl provided" }, { status: 400 });
    }

    const exposureVal = clamp(Number(exposure) || 0, -10, 10);
    const contrastVal = clamp(Number(contrast) || 0, -10, 10);
    const saturationVal = clamp(Number(saturation) || 0, -10, 10);
    const warmthVal = clamp(Number(warmth) || 0, -10, 10);

    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) {
      return NextResponse.json({ error: `Failed to fetch source image (${imageRes.status})` }, { status: 400 });
    }
    const inputBuffer = Buffer.from(await imageRes.arrayBuffer());

    // exposure/contrast via linear(a, b): output = input * a + b
    const contrastSlope = 1 + contrastVal * 0.05; // 0.5 .. 1.5
    const exposureIntercept = exposureVal * 5; // -50 .. 50

    // saturation via modulate: 1 = unchanged
    const saturationMultiplier = 1 + saturationVal * 0.06; // 0.4 .. 1.6

    const baseBuffer = await sharp(inputBuffer)
      .linear(contrastSlope, exposureIntercept)
      .modulate({ saturation: saturationMultiplier })
      .toBuffer();

    // sharp's tint() replaces the image's chroma entirely (preserving only luminance),
    // so applying it directly would turn the photo into a full duotone. Instead, generate
    // a fully-tinted version and composite it back over the base image at an opacity
    // proportional to the warmth magnitude, so it reads as a color cast, not a wash.
    let outputBuffer: Buffer;
    if (warmthVal !== 0) {
      const target = warmthVal > 0 ? { r: 255, g: 180, b: 120 } : { r: 120, g: 180, b: 255 };
      const opacity = (Math.abs(warmthVal) / 10) * 0.5; // up to 50% at |warmth| = 10

      const tintedBuffer = await sharp(baseBuffer).tint(target).toBuffer();
      // removeAlpha first: ensureAlpha only applies its value to a *newly created*
      // channel, so any existing (opaque) alpha from the source format must be stripped.
      const overlayBuffer = await sharp(tintedBuffer).removeAlpha().ensureAlpha(opacity).toBuffer();

      outputBuffer = await sharp(baseBuffer)
        .composite([{ input: overlayBuffer, blend: "over" }])
        .jpeg({ quality: 90 })
        .toBuffer();
    } else {
      outputBuffer = await sharp(baseBuffer).jpeg({ quality: 90 }).toBuffer();
    }

    return NextResponse.json({
      imageBase64: outputBuffer.toString("base64"),
      mediaType: "image/jpeg",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
