"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CaptionWriter from "@/components/CaptionWriter";

type Photo = {
  id: number;
  public_url: string;
  grid_position: number | null;
  analysis: Record<string, unknown> | null;
};

type AestheticProfile = {
  tags: string[];
  description: string;
};

type OrderedItem = { photo_id: string; reason: string };

type FixFeedResult = {
  issues: string[];
  suggested_order: OrderedItem[];
  left_out: OrderedItem[];
  shot_list: string[];
};

export default function GridPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [profile, setProfile] = useState<AestheticProfile | null>(null);
  const [targetProfile, setTargetProfile] = useState<AestheticProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FixFeedResult | null>(null);
  const [candidatePhotos, setCandidatePhotos] = useState<Photo[]>([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: photoRows, error: photoError } = await supabase
        .from("photos")
        .select("id, public_url, grid_position, analysis")
        .eq("source", "existing_feed")
        .not("grid_position", "is", null)
        .order("grid_position", { ascending: true });
      if (photoError) {
        setError(photoError.message);
      } else {
        setPhotos(photoRows as Photo[]);
      }

      const { data: profileRows } = await supabase
        .from("aesthetic_profile")
        .select("summary")
        .order("id", { ascending: false })
        .limit(1);
      if (profileRows && profileRows.length > 0) {
        setProfile(profileRows[0].summary as AestheticProfile);
      }

      const { data: targetRows } = await supabase
        .from("target_aesthetic_profile")
        .select("summary")
        .order("id", { ascending: false })
        .limit(1);
      if (targetRows && targetRows.length > 0) {
        setTargetProfile(targetRows[0].summary as AestheticProfile);
      }
    }
    load();
  }, []);

  async function handleGenerateTargetAesthetic() {
    setTargetLoading(true);
    setTargetError("");

    const { data: inspoPhotos, error: inspoError } = await supabase
      .from("photos")
      .select("analysis")
      .eq("source", "inspo")
      .not("analysis", "is", null);

    if (inspoError) {
      setTargetError(inspoError.message);
      setTargetLoading(false);
      return;
    }

    if (!inspoPhotos || inspoPhotos.length === 0) {
      setTargetError("No inspo photos with analysis found");
      setTargetLoading(false);
      return;
    }

    const res = await fetch("/api/aesthetic-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyses: inspoPhotos.map((p) => p.analysis) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setTargetError(data.error ?? "Request failed");
      setTargetLoading(false);
      return;
    }

    let newTarget: AestheticProfile;
    try {
      newTarget = JSON.parse(data.result);
    } catch {
      setTargetError("Model did not return valid JSON: " + data.result);
      setTargetLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("target_aesthetic_profile")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("target_aesthetic_profile")
        .update({ summary: newTarget })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("target_aesthetic_profile").insert({ summary: newTarget });
    }

    setTargetProfile(newTarget);
    setTargetLoading(false);
  }

  async function handleFixMyFeed() {
    setLoading(true);
    setError("");
    setResult(null);

    const { data: recentPosts, error: recentError } = await supabase
      .from("photos")
      .select("id, grid_position, analysis")
      .eq("source", "existing_feed")
      .not("grid_position", "is", null)
      .order("grid_position", { ascending: true })
      .limit(6);

    if (recentError) {
      setError(recentError.message);
      setLoading(false);
      return;
    }

    if (!recentPosts || recentPosts.length === 0) {
      setError("No existing_feed photos with grid_position found");
      setLoading(false);
      return;
    }

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

    setCandidatePhotos((candidates ?? []) as Photo[]);

    const res = await fetch("/api/fix-feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recentPosts,
        candidates: (candidates ?? []).map((c) => ({ id: c.id, analysis: c.analysis })),
        aestheticProfile: profile,
        targetAestheticProfile: targetProfile,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    try {
      setResult(JSON.parse(data.result));
    } catch {
      const preview = String(data.result ?? "").slice(0, 300);
      setError(
        `Couldn't parse the response as JSON (it may have been cut off mid-response). Response preview: ${preview}${
          data.result?.length > 300 ? "..." : ""
        }`
      );
    }

    setLoading(false);
  }

  function candidateById(id: string) {
    return candidatePhotos.find((p) => String(p.id) === id);
  }

  return (
    <div>
      <h1>Grid</h1>

      {profile && (
        <div>
          <h2>Your current aesthetic</h2>
          <p>{profile.tags.join(", ")}</p>
          <p>{profile.description}</p>
        </div>
      )}

      <div>
        <h2>Your target aesthetic</h2>
        <button onClick={handleGenerateTargetAesthetic} disabled={targetLoading}>
          {targetLoading ? "Generating..." : "Generate target aesthetic"}
        </button>
        {targetError && <p>Error: {targetError}</p>}
        {targetProfile && (
          <>
            <p>{targetProfile.tags.join(", ")}</p>
            <p>{targetProfile.description}</p>
          </>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "2px",
          maxWidth: "480px",
          margin: "0 auto",
        }}
      >
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.public_url}
            alt={`Grid position ${photo.grid_position}`}
            style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
          />
        ))}
      </div>

      <button onClick={handleFixMyFeed} disabled={loading}>
        {loading ? "Analyzing..." : "Fix my feed"}
      </button>
      {error && <p>Error: {error}</p>}

      {result && (
        <div>
          <h2>What&apos;s off</h2>
          <ul>
            {result.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>

          {result.suggested_order.length > 0 && (
            <>
              <h2>Suggested next posts</h2>
              <div style={{ display: "flex", gap: "16px", overflowX: "auto" }}>
                {result.suggested_order.map((item, i) => {
                  const photo = candidateById(item.photo_id);
                  return (
                    <div key={item.photo_id} style={{ flex: "0 0 auto", width: "220px" }}>
                      <p>Next {i + 1}</p>
                      {photo && (
                        <img
                          src={photo.public_url}
                          alt={`Photo ${item.photo_id}`}
                          width={220}
                          style={{ objectFit: "cover" }}
                        />
                      )}
                      <p>{item.reason}</p>
                      {photo?.analysis && <CaptionWriter analysis={photo.analysis} />}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {result.left_out.length > 0 && (
            <>
              <h2>Not ready yet</h2>
              <div style={{ display: "flex", gap: "16px", overflowX: "auto" }}>
                {result.left_out.map((item) => {
                  const photo = candidateById(item.photo_id);
                  return (
                    <div key={item.photo_id} style={{ flex: "0 0 auto", width: "220px" }}>
                      {photo && (
                        <img
                          src={photo.public_url}
                          alt={`Photo ${item.photo_id}`}
                          width={220}
                          style={{ objectFit: "cover" }}
                        />
                      )}
                      <p>{item.reason}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {result.suggested_order.length === 0 && result.shot_list.length > 0 && (
            <>
              <h2>What to shoot next</h2>
              <ul>
                {result.shot_list.map((shot, i) => (
                  <li key={i}>{shot}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
