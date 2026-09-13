"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  analysis: Record<string, unknown>;
  limit?: number;
  primary?: boolean;
};

export default function CaptionWriter({ analysis, limit, primary }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState<string[] | null>(null);
  const [usedIndex, setUsedIndex] = useState<number | null>(null);
  const [bannedIndexes, setBannedIndexes] = useState<Set<number>>(new Set());

  async function handleWriteCaption() {
    setLoading(true);
    setError("");
    setCaptions(null);
    setUsedIndex(null);
    setBannedIndexes(new Set());

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
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(data.result);
      setCaptions(parsed.captions);
    } catch {
      setError("Model did not return valid JSON: " + data.result);
    }

    setLoading(false);
  }

  async function handleUseThis(index: number) {
    const caption = captions?.[index];
    if (!caption) return;
    setUsedIndex(index);
    try {
      await navigator.clipboard.writeText(caption);
    } catch {
      // clipboard access may be unavailable; selection state still shown
    }
  }

  async function handleNeverSayAgain(index: number) {
    const caption = captions?.[index];
    if (!caption) return;

    const { data: existing } = await supabase
      .from("voice_profile")
      .select("id, avoid_phrases")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      const current: string[] = existing[0].avoid_phrases ?? [];
      await supabase
        .from("voice_profile")
        .update({ avoid_phrases: [...current, caption] })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("voice_profile").insert({ avoid_phrases: [caption] });
    }

    setBannedIndexes((prev) => new Set(prev).add(index));
  }

  return (
    <div>
      <button
        onClick={handleWriteCaption}
        disabled={loading}
        className={primary ? "btn-primary" : "link"}
      >
        {loading ? "Writing…" : "Write a caption"}
      </button>
      {error && <p className="text-secondary label-block">{error}</p>}
      {captions && (
        <div className="content-block">
          <p className="label">Caption</p>
          {(limit ? captions.slice(0, limit) : captions).map((caption, i) => (
            <div key={i} className={i === 0 ? "label-block" : "content-block"}>
              <p className="quote prose">{caption}</p>
              <div style={{ display: "flex", gap: "24px", marginTop: "8px" }}>
                <button
                  onClick={() => handleUseThis(i)}
                  disabled={usedIndex === i}
                  className="link"
                >
                  {usedIndex === i ? "Copied" : "Use this"}
                </button>
                <button
                  onClick={() => handleNeverSayAgain(i)}
                  disabled={bannedIndexes.has(i)}
                  className="link"
                >
                  {bannedIndexes.has(i) ? "Banned" : "Never say this again"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
