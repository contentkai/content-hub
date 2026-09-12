"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Summary = {
  tags: string[];
  description: string;
};

export default function AestheticPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadExistingSummary() {
    const { data } = await supabase
      .from("aesthetic_profile")
      .select("*")
      .order("id", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setSummary(data[0].summary as Summary);
    }
  }

  useEffect(() => {
    loadExistingSummary();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setError("");

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("analysis")
      .eq("source", "existing_feed")
      .not("analysis", "is", null);

    if (photosError) {
      setError(photosError.message);
      setLoading(false);
      return;
    }

    if (!photos || photos.length === 0) {
      setError("No existing_feed photos with analysis found");
      setLoading(false);
      return;
    }

    const analyses = photos.map((p) => p.analysis);

    const res = await fetch("/api/aesthetic-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyses }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    let newSummary: Summary;
    try {
      newSummary = JSON.parse(data.result);
    } catch {
      setError("Model did not return valid JSON: " + data.result);
      setLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("aesthetic_profile")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("aesthetic_profile")
        .update({ summary: newSummary })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("aesthetic_profile").insert({ summary: newSummary });
    }

    setSummary(newSummary);
    setLoading(false);
  }

  return (
    <div>
      <h1>Aesthetic Profile</h1>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate Aesthetic Profile"}
      </button>
      {error && <p>Error: {error}</p>}

      {summary && (
        <div>
          <h2>Tags</h2>
          <p>{summary.tags.join(", ")}</p>
          <h2>Description</h2>
          <p>{summary.description}</p>
        </div>
      )}
    </div>
  );
}
