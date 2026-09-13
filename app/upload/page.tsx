"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Photo = {
  id: number;
  storage_path: string;
  public_url: string;
  source: string | null;
  analysis: Record<string, unknown> | null;
  grid_position: number | null;
  existing_caption: string | null;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<
    "existing_feed" | "new_candidate" | "carousel_candidate" | "inspo"
  >("existing_feed");
  const [existingCaption, setExistingCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  async function loadPhotos() {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("id", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setPhotos(data as Photo[]);
    }
  }

  useEffect(() => {
    loadPhotos();
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");

    const storagePath = `${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, file);

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("photos")
      .getPublicUrl(storagePath);

    if (source === "existing_feed") {
      const { data: existingRows, error: shiftFetchError } = await supabase
        .from("photos")
        .select("id, grid_position")
        .eq("source", "existing_feed");

      if (shiftFetchError) {
        setError(shiftFetchError.message);
        setUploading(false);
        return;
      }

      const shiftErrors = await Promise.all(
        (existingRows ?? []).map(({ id, grid_position }) =>
          supabase
            .from("photos")
            .update({ grid_position: grid_position == null ? null : grid_position + 1 })
            .eq("id", id)
        )
      );
      const shiftError = shiftErrors.find((r) => r.error)?.error;
      if (shiftError) {
        setError(shiftError.message);
        setUploading(false);
        return;
      }
    }

    const { data: insertData, error: insertError } = await supabase
      .from("photos")
      .insert({
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        source,
        grid_position: source === "existing_feed" ? 1 : null,
        existing_caption:
          source === "existing_feed" && existingCaption.trim() !== "" ? existingCaption.trim() : null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    await loadPhotos();
    setFile(null);
    setExistingCaption("");
    setUploading(false);

    // Fire off vision analysis and backfill it once it comes back.
    const formData = new FormData();
    formData.append("image", file);

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
        await loadPhotos();
      } else {
        setError(data.error ?? "Vision analysis failed");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(photo: Photo) {
    if (!window.confirm("Delete this photo?")) return;

    const { error: storageError } = await supabase.storage.from("photos").remove([photo.storage_path]);
    if (storageError) {
      setError(storageError.message);
      return;
    }

    const { data: deletedRows, error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", photo.id)
      .select();
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError(
        "Delete didn't affect any rows — likely a missing RLS DELETE policy on the photos table."
      );
      return;
    }

    if (photo.source === "existing_feed" && photo.grid_position != null) {
      const { data: laterRows, error: laterError } = await supabase
        .from("photos")
        .select("id, grid_position")
        .eq("source", "existing_feed")
        .gt("grid_position", photo.grid_position);

      if (laterError) {
        setError(laterError.message);
        return;
      }

      const shiftErrors = await Promise.all(
        (laterRows ?? []).map(({ id, grid_position }) =>
          supabase
            .from("photos")
            .update({ grid_position: (grid_position as number) - 1 })
            .eq("id", id)
        )
      );
      const shiftError = shiftErrors.find((r) => r.error)?.error;
      if (shiftError) {
        setError(shiftError.message);
        return;
      }
    }

    await loadPhotos();
  }

  const sourceOptions: { value: typeof source; label: string }[] = [
    { value: "existing_feed", label: "Existing feed photo" },
    { value: "new_candidate", label: "New candidate photo" },
    { value: "carousel_candidate", label: "Carousel candidate" },
    { value: "inspo", label: "Inspo (target aesthetic)" },
  ];

  return (
    <div className="page">
      <h1>Upload</h1>

      <div className="section-block">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="content-block" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sourceOptions.map((opt) => (
            <label
              key={opt.value}
              style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="source"
                value={opt.value}
                checked={source === opt.value}
                onChange={() => setSource(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {source === "existing_feed" && (
          <div className="content-block">
            <label className="label text-secondary" style={{ textTransform: "none" }}>
              Original caption (if any)
            </label>
            <textarea
              value={existingCaption}
              onChange={(e) => setExistingCaption(e.target.value)}
              rows={3}
              className="label-block"
              style={{ width: "100%" }}
            />
          </div>
        )}

        <div className="content-block">
          <button onClick={handleUpload} disabled={!file || uploading} className="btn-primary">
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {error && <p className="text-secondary label-block">{error}</p>}
        </div>
      </div>

      <div className="section-block">
        <h2>Stored photos</h2>
        <div
          className="content-block"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "24px",
          }}
        >
          {photos.map((photo) => (
            <div key={photo.id} style={{ position: "relative" }}>
              <button
                onClick={() => handleDelete(photo)}
                title="Delete this photo"
                style={{
                  position: "absolute",
                  top: "6px",
                  right: "6px",
                  background: "var(--surface)",
                  color: "var(--paper)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "0",
                  width: "26px",
                  height: "26px",
                  cursor: "pointer",
                  fontSize: "13px",
                  lineHeight: 1,
                }}
              >
                🗑
              </button>
              <img
                src={photo.public_url}
                alt={photo.storage_path}
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  display: "block",
                  background: "var(--surface)",
                }}
              />
              <p className="text-secondary label-block" style={{ fontSize: "13px" }}>
                {photo.source ?? "(none)"}
              </p>
              {photo.source === "existing_feed" && (
                <>
                  <p className="text-secondary" style={{ fontSize: "13px" }}>
                    position {photo.grid_position ?? "—"}
                  </p>
                  {photo.existing_caption && (
                    <p className="quote label-block" style={{ fontSize: "14px" }}>
                      {photo.existing_caption}
                    </p>
                  )}
                </>
              )}
              <pre
                className="text-secondary label-block"
                style={{ whiteSpace: "pre-wrap", fontSize: "10px" }}
              >
                {photo.analysis ? JSON.stringify(photo.analysis, null, 2) : "(no analysis yet)"}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
