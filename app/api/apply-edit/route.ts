import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import convertHeic from "heic-convert";

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
      const body = await imageRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to fetch source image (${imageRes.status} ${imageRes.statusText}): ${body || photoUrl}` },
        { status: 400 }
      );
    }
    let inputBuffer = Buffer.from(await imageRes.arrayBuffer());

    // sharp's bundled HEIF decoder is unreliable on real-world HEIC files (fails with
    // "bad seek" / "Decoder plugin generated an error"), so convert to JPEG first via
    // heic-convert — the same approach already used for vision analysis.
    const contentType = imageRes.headers.get("content-type") ?? "";
    const isHeic =
      contentType.includes("heic") ||
      contentType.includes("heif") ||
      /\.(heic|heif)(\?|$)/i.test(photoUrl);
    if (isHeic) {
      const converted = await convertHeic({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
      inputBuffer = Buffer.from(converted);
    }

    // exposure/contrast via linear(a, b): output = input * a + b
    // "a" (slope) stays close to 1.0 so contrast shifts stay subtle at the edges of the
    // -10..10 range; "b" (offset) is a small shift in the 0-255 pixel range, not the raw value.
    const contrastSlope = 1 + contrastVal / 20; // 0.5 .. 1.5
    const exposureIntercept = exposureVal * 3; // -30 .. 30

    // saturation via modulate: 1 = unchanged, mapped the same way as contrast's slope
    const saturationMultiplier = 1 + saturationVal / 20; // 0.5 .. 1.5

    const baseBuffer = await sharp(inputBuffer)
      .linear(contrastSlope, exposureIntercept)
      .modulate({ saturation: saturationMultiplier })
      .toBuffer();

    let outputBuffer: Buffer;
    if (warmthVal !== 0) {
      const target = warmthVal > 0 ? { r: 255, g: 180, b: 120 } : { r: 120, g: 180, b: 255 };
      const opacity = (Math.abs(warmthVal) / 10) * 0.5; // up to 50% at |warmth| = 10

      // sharp's tint() replaces the image's chroma entirely (preserving only luminance),
      // so applying it directly would turn the photo into a full duotone. To get a subtle
      // color cast instead, blend the tinted version back over the base manually via raw
      // pixel math — sharp's composite() with a low-alpha PNG overlay was tried first, but
      // it silently drops the base layer's contribution (a premultiplied-alpha mismatch:
      // the composited result matched the overlay's premultiplied color almost exactly,
      // meaning the "* (1 - alpha)" base term was never actually applied), producing a
      // near-black image even at modest opacity. Manual linear interpolation on raw pixels
      // sidesteps that entirely and is trivial to verify correct.
      const tintedBuffer = await sharp(baseBuffer).tint(target).toBuffer();

      const { data: baseRaw, info } = await sharp(baseBuffer)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { data: tintedRaw } = await sharp(tintedBuffer)
        .removeAlpha()
        .resize(info.width, info.height)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const blended = Buffer.alloc(baseRaw.length);
      for (let i = 0; i < baseRaw.length; i++) {
        blended[i] = Math.round(baseRaw[i] * (1 - opacity) + tintedRaw[i] * opacity);
      }

      outputBuffer = await sharp(blended, {
        raw: { width: info.width, height: info.height, channels: info.channels },
      })
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
