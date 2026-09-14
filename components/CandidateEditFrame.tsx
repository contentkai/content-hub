"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  photoId: number;
  publicUrl: string;
  analysis: Record<string, unknown>;
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

const iconButtonStyle: React.CSSProperties = {
  width: "22px",
  height: "22px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(11, 18, 16, 0.72)",
  color: "var(--paper)",
  border: "1px solid var(--hairline)",
  borderRadius: "0",
  cursor: "pointer",
  padding: 0,
};

const smallTextButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  width: "auto",
  height: "auto",
  padding: "3px 7px",
  fontSize: "10px",
  lineHeight: 1.2,
};

export default function CandidateEditFrame({ photoId, publicUrl, analysis }: Props) {
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionError, setCaptionError] = useState("");
  const [captions, setCaptions] = useState<string[] | null>(null);
  const [captionIndex, setCaptionIndex] = useState(0);
  const [usedCaption, setUsedCaption] = useState(false);
  const [bannedCaption, setBannedCaption] = useState(false);

  const [editVariations, setEditVariations] = useState<Variation[] | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  // 0 = original, 1 = subtle match (editVariations[0]), 2 = stronger match (editVariations[1])
  const [stateIndex, setStateIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  async function fetchVariations(): Promise<Variation[] | null> {
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
      setEditError(data.error ?? "Request failed");
      return null;
    }

    let parsedVariations: EditValues[];
    try {
      parsedVariations = JSON.parse(data.result).variations;
    } catch {
      setEditError("Model did not return valid JSON: " + data.result);
      return null;
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

    setEditVariations(withPreviews);
    return withPreviews;
  }

  async function handleFilterTap() {
    if (saved || editLoading) return;
    setEditError("");
    let vars = editVariations;
    if (!vars) {
      setEditLoading(true);
      vars = await fetchVariations();
      setEditLoading(false);
      if (!vars) return;
    }
    setStateIndex(1);
  }

  function cycleState(dir: 1 | -1) {
    if (!editVariations || saved) return;
    setStateIndex((prev) => (prev + dir + 3) % 3);
  }

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(delta) < 30) return;
    cycleState(delta < 0 ? 1 : -1);
  }

  function handleRevert() {
    if (saved) return;
    setStateIndex(0);
  }

  async function handleSave() {
    if (!editVariations || stateIndex === 0 || saved) return;
    const variation = editVariations[stateIndex - 1];
    if (!variation?.previewDataUrl) return;

    setSaving(true);
    setEditError("");

    const base64 = variation.previewDataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const storagePath = `${Date.now()}-edited-${photoId}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, bytes, { contentType: "image/jpeg" });
    if (uploadError) {
      setEditError(uploadError.message);
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
      setEditError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  async function handleCaptionIconTap() {
    const opening = !captionsOpen;
    setCaptionsOpen(opening);
    if (opening && !captions && !captionLoading) {
      setCaptionLoading(true);
      setCaptionError("");

      const { data: profileRows } = await supabase
        .from("voice_profile")
        .select("summary, avoid_phrases")
        .order("id", { ascending: false })
        .limit(1);
      const voiceSummary = profileRows?.[0]?.summary ?? null;
      const avoidPhrases = profileRows?.[0]?.avoid_phrases ?? [];

      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoAnalysis: analysis, voiceSummary, avoidPhrases }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCaptionError(data.error ?? "Request failed");
        setCaptionLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(data.result);
        setCaptions(parsed.captions);
      } catch {
        setCaptionError("Model did not return valid JSON: " + data.result);
      }
      setCaptionLoading(false);
    }
  }

  async function handleUseCaption() {
    const caption = captions?.[captionIndex];
    if (!caption) return;
    setUsedCaption(true);
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      // clipboard access may be unavailable; selection state still shown
    }
  }

  async function handleBanCaption() {
    const caption = captions?.[captionIndex];
    if (!caption) return;

    const { data: existing } = await supabase
      .from("voice_profile")
      .select("id, avoid_phrases")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const current: string[] = existing[0].avoid_phrases ?? [];
      await supabase.from("voice_profile").update({ avoid_phrases: [...current, caption] }).eq("id", existing[0].id);
    } else {
      await supabase.from("voice_profile").insert({ avoid_phrases: [caption] });
    }
    setBannedCaption(true);
  }

  const activeVariation = editVariations && stateIndex !== 0 ? editVariations[stateIndex - 1] : null;
  const frameSrc = activeVariation?.previewDataUrl ?? publicUrl;

  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={frameSrc}
        alt="Candidate"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          background: "var(--surface)",
        }}
      />

      <div style={{ position: "absolute", top: "4px", right: "4px", display: "flex", gap: "4px" }}>
        <button onClick={handleCaptionIconTap} title="Captions" style={iconButtonStyle}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button onClick={handleFilterTap} title="Apply suggested edit" disabled={editLoading || saved} style={iconButtonStyle}>
          {editLoading ? (
            <span style={{ fontSize: "10px" }}>…</span>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          )}
        </button>
      </div>

      {editVariations && !captionsOpen && (
        <div style={{ position: "absolute", bottom: "4px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "3px" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: i === stateIndex ? "var(--paper)" : "rgba(244, 242, 236, 0.35)",
              }}
            />
          ))}
        </div>
      )}

      {editVariations && stateIndex !== 0 && !saved && !captionsOpen && (
        <>
          <button onClick={handleRevert} style={{ ...smallTextButtonStyle, position: "absolute", bottom: "4px", left: "4px" }}>
            Revert
          </button>
          <button onClick={handleSave} disabled={saving} style={{ ...smallTextButtonStyle, position: "absolute", bottom: "4px", right: "4px" }}>
            {saving ? "…" : "Save"}
          </button>
        </>
      )}

      {saved && !captionsOpen && (
        <span
          title="Saved"
          style={{
            ...iconButtonStyle,
            position: "absolute",
            bottom: "4px",
            right: "4px",
            background: "var(--accent)",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}

      {editError && (
        <p
          style={{
            position: "absolute",
            top: "30px",
            left: "4px",
            right: "4px",
            fontSize: "10px",
            background: "rgba(11, 18, 16, 0.85)",
            color: "var(--paper)",
            padding: "4px",
            margin: 0,
          }}
        >
          {editError}
        </p>
      )}

      {captionsOpen && (
        <div
          style={{
            position: "absolute",
            left: "4px",
            right: "4px",
            bottom: "4px",
            maxHeight: "55%",
            overflowY: "auto",
            background: "rgba(11, 18, 16, 0.88)",
            padding: "6px 7px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Caption
            </span>
            <button
              onClick={() => setCaptionsOpen(false)}
              style={{ background: "transparent", border: "none", color: "var(--paper)", cursor: "pointer", fontSize: "13px", padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {captionLoading && <p style={{ fontSize: "11px", margin: "4px 0 0" }}>Writing…</p>}
          {captionError && <p style={{ fontSize: "11px", margin: "4px 0 0" }}>{captionError}</p>}
          {captions && captions.length > 0 && (
            <>
              <p style={{ fontSize: "11px", fontStyle: "italic", margin: "4px 0" }}>{captions[captionIndex]}</p>
              <div style={{ display: "flex", gap: "8px", fontSize: "10px" }}>
                {captions.length > 1 && (
                  <button
                    onClick={() => setCaptionIndex((i) => (i + 1) % captions.length)}
                    style={{ background: "transparent", border: "none", color: "var(--paper)", cursor: "pointer", padding: 0 }}
                  >
                    Next
                  </button>
                )}
                <button
                  onClick={handleUseCaption}
                  disabled={usedCaption}
                  style={{ background: "transparent", border: "none", color: "var(--paper)", cursor: "pointer", padding: 0 }}
                >
                  {usedCaption ? "Copied" : "Use"}
                </button>
                <button
                  onClick={handleBanCaption}
                  disabled={bannedCaption}
                  style={{ background: "transparent", border: "none", color: "var(--paper)", cursor: "pointer", padding: 0 }}
                >
                  {bannedCaption ? "Banned" : "Ban"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
