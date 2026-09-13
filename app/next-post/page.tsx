"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Photo = {
  id: number;
  public_url: string;
  analysis: Record<string, unknown>;
};

type Recommendation = {
  recommend: boolean;
  photo_id: string | null;
  why: string;
  reason: string | null;
};

export default function NextPostPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chosenPhoto, setChosenPhoto] = useState<Photo | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setRecommendation(null);
    setChosenPhoto(null);

    const { data: candidates, error: candidatesError } = await supabase
      .from("photos")
      .select("id, public_url, analysis")
      .eq("source", "new_candidate")
      .not("analysis", "is", null);

    if (candidatesError) {
      setError(candidatesError.message);
      setLoading(false);
      return;
    }

    if (!candidates || candidates.length === 0) {
      setError("No candidate photos with analysis found");
      setLoading(false);
      return;
    }

    const { data: profileRows, error: profileError } = await supabase
      .from("aesthetic_profile")
      .select("summary")
      .order("id", { ascending: false })
      .limit(1);

    if (profileError) {
      setError(profileError.message);
      setLoading(false);
      return;
    }

    const aestheticProfile = profileRows?.[0]?.summary ?? null;

    const { data: recentPosts, error: recentError } = await supabase
      .from("photos")
      .select("id, grid_position, analysis")
      .eq("source", "existing_feed")
      .not("grid_position", "is", null)
      .order("grid_position", { ascending: true })
      .limit(3);

    if (recentError) {
      setError(recentError.message);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/next-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidates: candidates.map((c) => ({ id: c.id, analysis: c.analysis })),
        aestheticProfile,
        recentPosts,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    let rec: Recommendation;
    try {
      rec = JSON.parse(data.result);
    } catch {
      setError("Model did not return valid JSON: " + data.result);
      setLoading(false);
      return;
    }

    setRecommendation(rec);

    if (rec.recommend && rec.photo_id) {
      const match = candidates.find((c) => String(c.id) === rec.photo_id);
      setChosenPhoto(match ?? null);
    }

    setLoading(false);
  }

  return (
    <div>
      <h1>Next Post</h1>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Thinking..." : "Get Next Post Recommendation"}
      </button>
      {error && <p>Error: {error}</p>}

      {recommendation && recommendation.recommend && chosenPhoto && (
        <div>
          <img
            src={chosenPhoto.public_url}
            alt={`Photo ${chosenPhoto.id}`}
            style={{ maxWidth: "500px", width: "100%" }}
          />
          <p>{recommendation.why}</p>
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <p>{recommendation.reason}</p>
      )}
    </div>
  );
}
