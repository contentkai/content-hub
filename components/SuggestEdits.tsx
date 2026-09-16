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
  previewError?: string;
};

export default function SuggestEdits({ photoId, publicUrl, analysis, primary }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [variations, setVariations] = useState<Variation[] | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSuggestEdits() {
    setLoading(true);
    setError("");
    setVariations(null);
    setAppliedIndex(null);
    setSaved(false);

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
          return { ...v, previewDataUrl: undefined, previewError: editData.error ?? `Request failed (${editRes.status})` };
        }
        return { ...v, previewDataUrl: `data:${editData.mediaType};base64,${editData.imageBase64}` };
      })
    );

    setVariations(withPreviews);
    setLoading(false);
  }

  function handleApply(index: number) {
    if (saved) return;
    setAppliedIndex(index);
    setError("");
  }

  function handleRevert() {
    setAppliedIndex(null);
    setError("");
  }

  async function handleSave() {
    if (appliedIndex === null) return;
    const variation = variations?.[appliedIndex];
    if (!variation?.previewDataUrl) return;

    setSaving(true);
    setError("");

    const base64 = variation.previewDataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const storagePath = `${Date.now()}-edited-${photoId}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg" });

    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
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
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  const applied = appliedIndex !== null ? variations?.[appliedIndex] : undefined;
  const frameSrc = applied?.previewDataUrl ?? publicUrl;

  return (
    <div>
      <button
        onClick={handleSuggestEdits}
        disabled={loading}
        className={primary ? "btn-primary" : "link"}
      >
        {loading ? "Suggesting edits…" : "Filters"}
      </button>
      {error && <p className="text-secondary label-block">{error}</p>}

      {variations && (
        <div className="content-block" style={{ width: "240px" }}>
          <p className="label">{saved ? "Saved edit" : applied ? applied.label : "Original"}</p>

          <div className="label-block" style={{ position: "relative" }}>
            <img
              src={frameSrc}
              alt={applied ? applied.label : "Original"}
              style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", background: "var(--surface)" }}
            />

            {applied && (
              <div style={{ position: "absolute", bottom: "6px", right: "6px", display: "flex", gap: "6px" }}>
                {saved ? (
                  <span
                    title="Saved"
                    style={{
                      background: "var(--accent)",
                      color: "var(--paper)",
                      width: "26px",
                      height: "26px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : (
                  <>
                    <button
                      onClick={handleRevert}
                      disabled={saving}
                      style={{
                        background: "var(--surface)",
                        color: "var(--paper)",
                        border: "1px solid var(--hairline)",
                        borderRadius: "0",
                        padding: "4px 10px",
                        fontSize: "13px",
                        cursor: "pointer",
                      }}
                    >
                      Revert
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !applied.previewDataUrl}
                      style={{
                        background: "var(--paper)",
                        color: "var(--bg)",
                        border: "none",
                        borderRadius: "0",
                        padding: "4px 10px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {applied && <p className="quote content-block">{applied.reason}</p>}

          {!saved && (
            <div className="label-block" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {variations.map((v, i) =>
                v.previewDataUrl ? (
                  <button
                    key={i}
                    onClick={() => handleApply(i)}
                    className="link"
                    style={{ opacity: appliedIndex === i ? 1 : 0.6 }}
                  >
                    {v.label}
                  </button>
                ) : (
                  <span key={i} className="text-secondary" style={{ fontSize: "13px" }} title={v.previewError ?? "Preview failed"}>
                    {v.label} (failed)
                  </span>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
