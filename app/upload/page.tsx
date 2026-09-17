"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { regenerateAestheticProfile } from "@/lib/regenerateAestheticProfile";
import { uploadAndAnalyzePhoto } from "@/lib/uploadAndAnalyzePhoto";
import PhotoBatchPreview from "@/components/PhotoBatchPreview";

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
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<"existing_feed" | "new_candidate">("existing_feed");
  const [existingCaption, setExistingCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
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
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    setProgress({ current: 0, total: files.length });

    const errors: string[] = [];
    let anyExistingFeed = false;

    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      try {
        await uploadAndAnalyzePhoto(files[i], source, source === "existing_feed" ? existingCaption : null);
        if (source === "existing_feed") anyExistingFeed = true;
      } catch (err) {
        errors.push(`${files[i].name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (anyExistingFeed) {
      await regenerateAestheticProfile();
    }

    await loadPhotos();
    setFiles([]);
    setExistingCaption("");
    setProgress(null);
    setUploading(false);
    if (errors.length > 0) {
      setError(errors.join("; "));
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
  ];

  return (
    <div className="page">
      <h1>Upload</h1>

      <div className="section-block">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />

        <PhotoBatchPreview files={files} />

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
          <button onClick={handleUpload} disabled={files.length === 0 || uploading} className="btn-primary">
            {uploading
              ? `Analyzing ${progress?.current ?? 0} of ${progress?.total ?? 0}…`
              : files.length > 1
                ? `Upload ${files.length} photos`
                : "Upload"}
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
