"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import SwipeCarousel from "@/components/SwipeCarousel";

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

type MatchedValues = {
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
  reason: string;
};

type MatchedPreview = { previewDataUrl?: string; previewError?: string };

export default function CarouselPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CarouselResult | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [matchedResult, setMatchedResult] = useState<MatchedValues | null>(null);
  const [matchedPreviews, setMatchedPreviews] = useState<Record<string, MatchedPreview> | null>(null);
  const [matchedLoading, setMatchedLoading] = useState(false);
  const [matchedError, setMatchedError] = useState("");

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

  useEffect(() => {
    loadCandidates();
  }, []);

  async function handleUploadCandidate() {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError("");

    const storagePath = `${Date.now()}-${uploadFile.name}`;

    const { error: uploadErr } = await supabase.storage.from("photos").upload(storagePath, uploadFile);
    if (uploadErr) {
      setUploadError(uploadErr.message);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("photos").getPublicUrl(storagePath);

    const { data: insertData, error: insertError } = await supabase
      .from("photos")
      .insert({
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        source: "carousel_candidate",
        grid_position: null,
        existing_caption: null,
      })
      .select()
      .single();
    if (insertError) {
      setUploadError(insertError.message);
      setUploading(false);
      return;
    }

    await loadCandidates();
    const uploadedFile = uploadFile;
    setUploadFile(null);
    setUploading(false);

    const formData = new FormData();
    formData.append("image", uploadedFile);

    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        let analysis: Record<string, unknown>;
        try {
          analysis = JSON.parse(data.result);
        } catch {
          analysis = { error: "invalid JSON from model", raw: data.result };
        }
        await supabase.from("photos").update({ analysis }).eq("id", insertData.id);
        await loadCandidates();
      } else {
        setUploadError(data.error ?? "Vision analysis failed");
      }
    } catch (err) {
      setUploadError(String(err));
    }
  }

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
    setSaved(false);
    setMatchedResult(null);
    setMatchedPreviews(null);
    setMatchedError("");

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
    setLoading(false);

    buildMatchedVersion(parsed.sequence, targetAestheticProfile);
  }

  async function buildMatchedVersion(
    sequenceItems: SequenceItem[],
    targetAestheticProfile: Record<string, unknown> | null
  ) {
    setMatchedLoading(true);
    setMatchedError("");

    const sequencePhotos = sequenceItems
      .map((item) => photos.find((p) => String(p.id) === item.photo_id))
      .filter((p): p is Photo => !!p);

    if (sequencePhotos.length === 0) {
      setMatchedLoading(false);
      return;
    }

    const res = await fetch("/api/match-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos: sequencePhotos.map((p) => ({ id: p.id, analysis: p.analysis })),
        targetAestheticProfile,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMatchedError(data.error ?? "Request failed");
      setMatchedLoading(false);
      return;
    }

    let values: MatchedValues;
    try {
      values = JSON.parse(data.result);
    } catch {
      setMatchedError("Model did not return valid JSON: " + data.result);
      setMatchedLoading(false);
      return;
    }

    setMatchedResult(values);

    const previews: Record<string, MatchedPreview> = {};
    await Promise.all(
      sequencePhotos.map(async (p) => {
        const editRes = await fetch("/api/apply-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoUrl: p.public_url,
            exposure: values.exposure,
            contrast: values.contrast,
            saturation: values.saturation,
            warmth: values.warmth,
          }),
        });
        const editData = await editRes.json();
        if (!editRes.ok) {
          previews[String(p.id)] = { previewError: editData.error ?? `Request failed (${editRes.status})` };
        } else {
          previews[String(p.id)] = { previewDataUrl: `data:${editData.mediaType};base64,${editData.imageBase64}` };
        }
      })
    );

    setMatchedPreviews(previews);
    setMatchedLoading(false);
  }

  async function handleSaveCarousel() {
    if (!result) return;
    setSaving(true);
    setError("");

    const rationale: Record<string, string> = {};
    for (const item of result.sequence) rationale[item.photo_id] = item.reason;
    for (const item of result.dropped) rationale[item.photo_id] = item.reason;

    const { error: draftError } = await supabase.from("drafts").insert({
      type: "carousel",
      photo_ids: result.sequence.map((item) => item.photo_id),
      rationale,
    });

    if (draftError) {
      setError(draftError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
  }

  function photoById(id: string) {
    return photos.find((p) => String(p.id) === id);
  }

  return (
    <div className="page">
      <h1>Carousel</h1>

      <div className="section-block">
        <h2>Upload a candidate photo</h2>
        <div className="content-block">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="content-block">
          <button onClick={handleUploadCandidate} disabled={!uploadFile || uploading} className="link">
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {uploadError && <p className="text-secondary label-block">{uploadError}</p>}
        </div>
      </div>

      <div className="section-block">
        <h2>Candidate photos</h2>
        <div
          className="content-block"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "2px",
          }}
        >
          {photos.map((photo) => (
            <label key={photo.id} style={{ position: "relative", cursor: "pointer", display: "block" }}>
              <input
                type="checkbox"
                checked={selectedIds.has(photo.id)}
                onChange={() => toggleSelected(photo.id)}
                style={{ position: "absolute", top: "6px", left: "6px", zIndex: 1 }}
              />
              <img
                src={photo.public_url}
                alt={`Photo ${photo.id}`}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  display: "block",
                  background: "var(--surface)",
                  opacity: selectedIds.has(photo.id) ? 1 : 0.55,
                }}
              />
            </label>
          ))}
        </div>

        <div className="content-block">
          <button onClick={handleBuildCarousel} disabled={loading} className="btn-primary">
            {loading ? "Building…" : "Build carousel"}
          </button>
          {error && <p className="text-secondary label-block">{error}</p>}
        </div>
      </div>

      {result && (
        <div className="section-block">
          <h2>Sequence</h2>

          {!saved ? (
            <div className="content-block" style={{ display: "flex", gap: "24px", overflowX: "auto" }}>
              {result.sequence.map((item, i) => {
                const photo = photoById(item.photo_id);
                return (
                  <div key={item.photo_id} style={{ flex: "0 0 auto", width: "200px" }}>
                    <p className="label">Slide {i + 1}</p>
                    {photo && (
                      <img
                        src={photo.public_url}
                        alt={`Photo ${item.photo_id}`}
                        className="label-block"
                        style={{
                          width: "100%",
                          aspectRatio: "1 / 1",
                          objectFit: "cover",
                          background: "var(--surface)",
                        }}
                      />
                    )}
                    <p className="quote content-block">{item.reason}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="content-block">
              <SwipeCarousel
                items={result.sequence
                  .map((item) => {
                    const photo = photoById(item.photo_id);
                    return photo ? { id: item.photo_id, src: photo.public_url, caption: item.reason } : null;
                  })
                  .filter((item): item is { id: string; src: string; caption: string } => !!item)}
              />
            </div>
          )}

          <div className="content-block">
            {!saved ? (
              <button onClick={handleSaveCarousel} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save carousel"}
              </button>
            ) : (
              <p className="text-secondary" style={{ fontSize: "13px" }}>
                Saved to drafts.
              </p>
            )}
          </div>

          {result.dropped.length > 0 && (
            <div className="section-block">
              <h2>Dropped</h2>
              <div className="content-block" style={{ display: "flex", gap: "24px", overflowX: "auto" }}>
                {result.dropped.map((item) => {
                  const photo = photoById(item.photo_id);
                  return (
                    <div key={item.photo_id} style={{ flex: "0 0 auto", width: "200px", opacity: 0.6 }}>
                      {photo && (
                        <img
                          src={photo.public_url}
                          alt={`Photo ${item.photo_id}`}
                          style={{
                            width: "100%",
                            aspectRatio: "1 / 1",
                            objectFit: "cover",
                            background: "var(--surface)",
                          }}
                        />
                      )}
                      <p className="quote content-block">{item.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="section-block">
            <h2>Matched version</h2>
            {matchedLoading && <p className="text-secondary content-block">Generating matched version…</p>}
            {matchedError && <p className="text-secondary content-block">{matchedError}</p>}

            {matchedResult && matchedPreviews && (
              <>
                <p className="quote content-block">{matchedResult.reason}</p>

                {!saved ? (
                  <div className="content-block" style={{ display: "flex", gap: "24px", overflowX: "auto" }}>
                    {result.sequence.map((item, i) => {
                      const preview = matchedPreviews[item.photo_id];
                      return (
                        <div key={item.photo_id} style={{ flex: "0 0 auto", width: "200px" }}>
                          <p className="label">Slide {i + 1}</p>
                          {preview?.previewDataUrl ? (
                            <img
                              src={preview.previewDataUrl}
                              alt={`Matched slide ${i + 1}`}
                              className="label-block"
                              style={{
                                width: "100%",
                                aspectRatio: "1 / 1",
                                objectFit: "cover",
                                background: "var(--surface)",
                              }}
                            />
                          ) : (
                            <p className="text-secondary label-block">
                              {preview?.previewError ?? "Preview failed"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="content-block">
                    <SwipeCarousel
                      items={result.sequence
                        .map((item) => {
                          const preview = matchedPreviews[item.photo_id];
                          return preview?.previewDataUrl
                            ? { id: item.photo_id, src: preview.previewDataUrl }
                            : null;
                        })
                        .filter((item): item is { id: string; src: string } => !!item)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
