"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Photo = {
  id: number;
  public_url: string;
  analysis: Record<string, unknown>;
};

type SequenceItem = { photo_id: string; reason: string };

type CarouselResult = {
  sequence: SequenceItem[];
  dropped: SequenceItem[];
};

export default function CarouselPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CarouselResult | null>(null);

  useEffect(() => {
    async function loadCandidates() {
      const { data, error } = await supabase
        .from("photos")
        .select("id, public_url, analysis")
        .eq("source", "carousel_candidate")
        .not("analysis", "is", null);
      if (error) {
        setError(error.message);
      } else {
        setPhotos(data as Photo[]);
      }
    }
    loadCandidates();
  }, []);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleBuildCarousel() {
    setLoading(true);
    setError("");
    setResult(null);

    const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));

    if (selectedPhotos.length === 0) {
      setError("Select at least one photo");
      setLoading(false);
      return;
    }

    const { data: targetRows } = await supabase
      .from("target_aesthetic_profile")
      .select("summary")
      .order("id", { ascending: false })
      .limit(1);
    const targetAestheticProfile = targetRows?.[0]?.summary ?? null;

    const res = await fetch("/api/carousel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos: selectedPhotos.map((p) => ({ id: p.id, analysis: p.analysis })),
        targetAestheticProfile,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Request failed");
      setLoading(false);
      return;
    }

    let parsed: CarouselResult;
    try {
      parsed = JSON.parse(data.result);
    } catch {
      setError("Model did not return valid JSON: " + data.result);
      setLoading(false);
      return;
    }

    setResult(parsed);

    const rationale: Record<string, string> = {};
    for (const item of parsed.sequence) rationale[item.photo_id] = item.reason;
    for (const item of parsed.dropped) rationale[item.photo_id] = item.reason;

    await supabase.from("drafts").insert({
      type: "carousel",
      photo_ids: parsed.sequence.map((item) => item.photo_id),
      rationale,
    });

    setLoading(false);
  }

  function photoById(id: string) {
    return photos.find((p) => String(p.id) === id);
  }

  return (
    <div>
      <h1>Carousel</h1>

      <h2>Candidate Photos</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 150px)", gap: "12px" }}>
        {photos.map((photo) => (
          <label key={photo.id} style={{ display: "block", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedIds.has(photo.id)}
              onChange={() => toggleSelected(photo.id)}
            />
            <img
              src={photo.public_url}
              alt={`Photo ${photo.id}`}
              width={150}
              height={150}
              style={{ objectFit: "cover" }}
            />
          </label>
        ))}
      </div>

      <button onClick={handleBuildCarousel} disabled={loading}>
        {loading ? "Building..." : "Build carousel"}
      </button>
      {error && <p>Error: {error}</p>}

      {result && (
        <div>
          <h2>Sequence</h2>
          <div style={{ display: "flex", gap: "16px", overflowX: "auto" }}>
            {result.sequence.map((item, i) => {
              const photo = photoById(item.photo_id);
              return (
                <div key={item.photo_id} style={{ flex: "0 0 auto", width: "220px" }}>
                  <p>Slide {i + 1}</p>
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

          {result.dropped.length > 0 && (
            <div>
              <h2>Dropped</h2>
              <div style={{ display: "flex", gap: "16px", overflowX: "auto" }}>
                {result.dropped.map((item) => {
                  const photo = photoById(item.photo_id);
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
