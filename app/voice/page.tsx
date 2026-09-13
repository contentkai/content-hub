"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function VoicePage() {
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadExisting() {
    const { data } = await supabase
      .from("voice_profile")
      .select("summary")
      .order("id", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setSummary(String(data[0].summary));
    }
  }

  useEffect(() => {
    loadExisting();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError("");

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("existing_caption")
      .eq("source", "existing_feed")
      .not("existing_caption", "is", null);

    if (photosError) {
      setError(photosError.message);
      setLoading(false);
      return;
    }

    const captions = (photos ?? []).map((p) => p.existing_caption).filter(Boolean);

    if (captions.length === 0) {
      setError("No existing_feed photos with a caption found");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/voice-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captions }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    const newSummary = data.result;

    const { data: existing } = await supabase
      .from("voice_profile")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from("voice_profile").update({ summary: newSummary }).eq("id", existing[0].id);
    } else {
      await supabase.from("voice_profile").insert({ summary: newSummary });
    }

    setSummary(newSummary);
    setLoading(false);
  }

  return (
    <div>
      <h1>Voice Profile</h1>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate Voice Profile"}
      </button>
      {error && <p>Error: {error}</p>}
      {summary && <p style={{ whiteSpace: "pre-wrap" }}>{summary}</p>}
    </div>
  );
}
