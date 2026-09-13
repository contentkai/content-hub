"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  photoId: number;
  publicUrl: string;
  analysis: Record<string, unknown>;
  primary?: boolean;
};

type EditValues = {
  label: string;
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  reason: string;
};

type Variation = EditValues & {
  previewDataUrl?: string;
  used?: boolean;
};

export default function SuggestEdits({ photoId, publicUrl, analysis, primary }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [variations, setVariations] = useState<Variation[] | null>(null);

  async function handleSuggestEdits() {
    setLoading(true);
    setError("");
    setVariations(null);

    const { data: profileRows } = await supabase
      .from("aesthetic_profile")
      .select("summary")
      .order("id", { ascending: false })
      .limit(1);
    const aestheticProfile = profileRows?.[0]?.summary ?? null;

    const { data: targetRows } = await supabase
      .from("target_aesthetic_profile")
      .select("summary")
      .order("id", { ascending: false })
      .limit(1);
    const targetAestheticProfile = targetRows?.[0]?.summary ?? null;

    const res = await fetch("/api/suggest-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoAnalysis: analysis, aestheticProfile, targetAestheticProfile }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    let parsedVariations: EditValues[];
    try {
      parsedVariations = JSON.parse(data.result).variations;
    } catch {
      setError("Model did not return valid JSON: " + data.result);
      setLoading(false);
      return;
    }

    const withPreviews = await Promise.all(
      parsedVariations.map(async (v) => {
        const editRes = await fetch("/api/apply-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoUrl: publicUrl,
            exposure: v.exposure,
            contrast: v.contrast,
            saturation: v.saturation,
            warmth: v.warmth,
          }),
        });
        const editData = await editRes.json();
        if (!editRes.ok) {
          return { ...v, previewDataUrl: undefined };
        }
        return { ...v, previewDataUrl: `data:${editData.mediaType};base64,${editData.imageBase64}` };
      })
    );

    setVariations(withPreviews);
    setLoading(false);
  }

  async function handleUseThisVersion(index: number) {
    const variation = variations?.[index];
    if (!variation?.previewDataUrl) return;

    const base64 = variation.previewDataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const storagePath = `${Date.now()}-edited-${photoId}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg" });

    if (uploadError) {
      setError(uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("photos").getPublicUrl(storagePath);

    const { error: insertError } = await supabase.from("photos").insert({
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
      source: "edited_variant",
      parent_photo_id: photoId,
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setVariations((prev) =>
      prev ? prev.map((v, i) => (i === index ? { ...v, used: true } : v)) : prev
    );
  }

  return (
    <div>
      <button
        onClick={handleSuggestEdits}
        disabled={loading}
        className={primary ? "btn-primary" : "link"}
      >
        {loading ? "Suggesting edits…" : "Suggest edits"}
      </button>
      {error && (
        <p className="text-secondary" style={{ fontSize: "13px", marginTop: "8px" }}>
          {error}
        </p>
      )}

      {variations && (
        <div style={{ display: "flex", gap: "20px", marginTop: "16px", overflowX: "auto" }}>
          <div style={{ flex: "0 0 auto", width: "200px" }}>
            <p className="text-secondary" style={{ fontSize: "12px", marginBottom: "6px" }}>
              Original
            </p>
            <img
              src={publicUrl}
              alt="Original"
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "var(--surface)" }}
            />
          </div>
          {variations.map((v, i) => (
            <div key={i} style={{ flex: "0 0 auto", width: "200px" }}>
              <p className="text-secondary" style={{ fontSize: "12px", marginBottom: "6px" }}>
                {v.label}
              </p>
              {v.previewDataUrl ? (
                <img
                  src={v.previewDataUrl}
                  alt={v.label}
                  style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", background: "var(--surface)" }}
                />
              ) : (
                <p className="text-secondary" style={{ fontSize: "13px" }}>
                  Preview failed
                </p>
              )}
              <p className="serif" style={{ fontSize: "14px", marginTop: "8px" }}>
                {v.reason}
              </p>
              <button
                onClick={() => handleUseThisVersion(i)}
                disabled={!v.previewDataUrl || v.used}
                className="link"
                style={{ fontSize: "13px", marginTop: "4px" }}
              >
                {v.used ? "Saved" : "Use this version"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
