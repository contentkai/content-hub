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

    // The shift-existing-rows-up + insert-at-position-1 sequence has to happen atomically —
    // doing it as separate client-side reads/updates (the old approach) races against any
    // other upload happening around the same time, since each call reads a snapshot of
    // grid_position before the other's shift has committed. insert_existing_feed_photo runs
    // both steps inside a single Postgres transaction instead.
    let insertData: { id: number };
    if (source === "existing_feed") {
      const { data, error: insertError } = await supabase.rpc("insert_existing_feed_photo", {
        p_storage_path: storagePath,
        p_public_url: publicUrlData.publicUrl,
        p_existing_caption: existingCaption.trim() !== "" ? existingCaption.trim() : null,
      });
      if (insertError) {
        setError(insertError.message);
        setUploading(false);
        return;
      }
      insertData = data;
    } else {
      const { data, error: insertError } = await supabase
        .from("photos")
        .insert({
          storage_path: storagePath,
          public_url: publicUrlData.publicUrl,
          source,
          grid_position: null,
          existing_caption: null,
        })
        .select()
        .single();
      if (insertError) {
        setError(insertError.message);
        setUploading(false);
        return;
      }
      insertData = data;
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

    // delete_photo removes the row and (if it was an existing_feed photo) closes the gap in
    // grid_position atomically in one transaction — see insert_existing_feed_photo above for
    // why this can't safely be done as separate client-side reads/updates. It also runs as
    // security definer, so it isn't subject to the RLS-silent-failure gotcha the old delete
    // path had to specifically check for; it raises an error if the row doesn't exist instead.
    const { error: deleteError } = await supabase.rpc("delete_photo", { p_photo_id: photo.id });
    if (deleteError) {
      setError(deleteError.message);
      return;
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                </svg>
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
