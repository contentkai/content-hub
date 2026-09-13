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

  async function loadCandidates() {
    const { data, error: candidatesError } = await supabase
      .from("photos")
      .select("id, public_url, analysis")
      .eq("source", "new_candidate")
      .not("analysis", "is", null)
      .order("id", { ascending: true });
    if (candidatesError) {
      setError(candidatesError.message);
    } else {
      setCandidatePhotos((data ?? []) as Photo[]);
    }
    return data ?? [];
  }

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

      await loadCandidates();
    }
    load();
  }, []);

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

    const candidates = await loadCandidates();

    if (candidates.length === 0) {
      setError("No candidate photos with analysis found");
      setLoading(false);
      return;
    }

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

  type CandidateSlot = { photo: Photo; badge?: number; reason?: string; deprioritized: boolean };

  function getOrderedCandidates(): CandidateSlot[] {
    if (!result) {
      return candidatePhotos.map((photo) => ({ photo, deprioritized: false }));
    }

    const top3 = result.suggested_order.slice(0, 3);
    const restSuggested = result.suggested_order.slice(3);

    const topSlots: CandidateSlot[] = top3.flatMap((item, i) => {
      const photo = candidateById(item.photo_id);
      return photo ? [{ photo, badge: i + 1, reason: item.reason, deprioritized: false }] : [];
    });

    const deprioritizedSlots: CandidateSlot[] = [...restSuggested, ...result.left_out].flatMap((item) => {
      const photo = candidateById(item.photo_id);
      return photo ? [{ photo, reason: item.reason, deprioritized: true }] : [];
    });

    const mentionedIds = new Set([
      ...result.suggested_order.map((i) => i.photo_id),
      ...result.left_out.map((i) => i.photo_id),
    ]);
    const unmentionedSlots: CandidateSlot[] = candidatePhotos
      .filter((p) => !mentionedIds.has(String(p.id)))
      .map((photo) => ({ photo, deprioritized: false }));

    return [...topSlots, ...deprioritizedSlots, ...unmentionedSlots];
  }

  return (
    <div className="page">
      <h1>Grid</h1>

      <div className="section-block">
        <h2>Candidates</h2>
        <div
          className="content-block"
          style={{
            border: "1px dashed var(--hairline)",
            padding: "8px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "2px",
            }}
          >
            {getOrderedCandidates().map((slot) => (
              <div
                key={slot.photo.id}
                style={{ position: "relative", opacity: slot.deprioritized ? 0.45 : 1 }}
                title={slot.deprioritized ? slot.reason : undefined}
              >
                <img
                  src={slot.photo.public_url}
                  alt={`Candidate ${slot.photo.id}`}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    display: "block",
                    background: "var(--surface)",
                  }}
                />
                {slot.badge && (
                  <span
                    style={{
                      position: "absolute",
                      top: "4px",
                      left: "4px",
                      background: "var(--accent)",
                      color: "var(--paper)",
                      borderRadius: "50%",
                      width: "20px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                    }}
                  >
                    {slot.badge}
                  </span>
                )}
                {slot.reason && !slot.deprioritized && (
                  <p className="quote label-block" style={{ fontSize: "14px", padding: "0 4px" }}>
                    {slot.reason}
                  </p>
                )}
                {slot.badge && (
                  <div className="label-block" style={{ padding: "0 4px" }}>
                    <CaptionWriter analysis={slot.photo.analysis as Record<string, unknown>} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-block">
        <h2>Your grid</h2>
        <div
          className="content-block"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2px",
          }}
        >
          {photos.map((photo) => (
            <img
              key={photo.id}
              src={photo.public_url}
              alt={`Grid position ${photo.grid_position}`}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                background: "var(--surface)",
              }}
            />
          ))}
        </div>
      </div>

      <div className="section-block">
        <button onClick={handleFixMyFeed} disabled={loading} className="btn-primary">
          {loading ? "Analyzing…" : "Fix my feed"}
        </button>
        {error && <p className="text-secondary label-block">{error}</p>}
      </div>

      {result && (
        <div className="section-block">
          <h2>What&apos;s off</h2>
          <ul className="prose content-block" style={{ paddingLeft: "18px" }}>
            {result.issues.map((issue, i) => (
              <li key={i} style={{ marginBottom: "8px" }}>
                {issue}
              </li>
            ))}
          </ul>

          {result.suggested_order.length === 0 && result.shot_list.length > 0 && (
            <div className="content-block">
              <h2>What to shoot next</h2>
              <ul className="prose content-block" style={{ paddingLeft: "18px" }}>
                {result.shot_list.map((shot, i) => (
                  <li key={i} style={{ marginBottom: "8px" }}>
                    {shot}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
