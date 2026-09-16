"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import CandidateEditFrame from "@/components/CandidateEditFrame";

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
  const [candidateOrder, setCandidateOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function loadCandidates() {
    const { data, error: candidatesError } = await supabase
      .from("photos")
      .select("id, public_url, analysis")
      .eq("source", "new_candidate")
      .not("analysis", "is", null)
      .order("id", { ascending: false });
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

      const candidates = await loadCandidates();
      // Default arrangement before any AI involvement: most recently uploaded first,
      // same convention as existing_feed's grid_position — the query above already
      // orders candidates by id descending.
      setCandidateOrder((candidates ?? []).map((c) => String(c.id)));
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
      const parsed: FixFeedResult = JSON.parse(data.result);
      setResult(parsed);
      setCandidateOrder(parsed.suggested_order.map((item) => item.photo_id));
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

  function handleResetPreview() {
    if (!result) return;
    setCandidateOrder(result.suggested_order.map((item) => item.photo_id));
  }

  function candidateById(id: string) {
    return candidatePhotos.find((p) => String(p.id) === id);
  }

  function handleDragStart(id: string) {
    setDraggedId(id);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    const fromIndex = candidateOrder.indexOf(draggedId);
    const toIndex = candidateOrder.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      return;
    }
    const newOrder = [...candidateOrder];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedId);
    setCandidateOrder(newOrder);
    setDraggedId(null);
  }

  type DeprioritizedSlot = { photo: Photo; reason: string };

  function getLeftOutSlots(): DeprioritizedSlot[] {
    if (!result) return [];
    return result.left_out.flatMap((item) => {
      const photo = candidateById(item.photo_id);
      return photo ? [{ photo, reason: item.reason }] : [];
    });
  }

  return (
    <div className="page">
      <h1>Grid</h1>

      <div className="section-block">
        {result && (
          <button onClick={handleResetPreview} className="link">
            Reset preview
          </button>
        )}
        {candidateOrder.length > 0 && (
          <p className="text-secondary label-block" style={{ fontSize: "13px" }}>
            Drag a candidate to try a different order — nothing is saved until you post it.
          </p>
        )}

        <div
          className="content-block"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2px",
          }}
        >
          {candidateOrder.map((id, i) => {
            const photo = candidateById(id);
            if (!photo) return null;

            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(id)}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  cursor: "grab",
                  opacity: draggedId === id ? 0.4 : 1,
                }}
              >
                <CandidateEditFrame
                  photoId={photo.id}
                  publicUrl={photo.public_url}
                  analysis={photo.analysis as Record<string, unknown>}
                />
                {result && (
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
                    {i + 1}
                  </span>
                )}
              </div>
            );
          })}

          {candidateOrder.length > 0 && photos.length > 0 && (
            <div style={{ gridColumn: "1 / -1", padding: "16px 0" }}>
              <p className="label" style={{ textAlign: "center" }}>
                Not yet posted
              </p>
              <div style={{ borderTop: "1px solid var(--hairline)", margin: "8px 0" }} />
              <p className="label" style={{ textAlign: "center" }}>
                Posted
              </p>
            </div>
          )}

          {photos.map((photo) => (
            <img
              key={photo.id}
              src={photo.public_url}
              alt={`Grid position ${photo.grid_position}`}
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                objectFit: "cover",
                display: "block",
                background: "var(--surface)",
              }}
            />
          ))}
        </div>

        {getLeftOutSlots().length > 0 && (
          <div className="content-block">
            <h2 style={{ fontSize: "18px" }}>Not in this preview</h2>
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
                {getLeftOutSlots().map((slot) => (
                  <div
                    key={slot.photo.id}
                    style={{ position: "relative", opacity: 0.45 }}
                    title={slot.reason}
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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
