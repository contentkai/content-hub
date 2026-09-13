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
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"existing_feed" | "new_candidate" | "carousel_candidate">(
    "existing_feed"
  );
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

  return (
    <div>
      <h1>Upload</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div>
        <label>
          <input
            type="radio"
            name="source"
            value="existing_feed"
            checked={source === "existing_feed"}
            onChange={() => setSource("existing_feed")}
          />
          Existing feed photo
        </label>
        <label>
          <input
            type="radio"
            name="source"
            value="new_candidate"
            checked={source === "new_candidate"}
            onChange={() => setSource("new_candidate")}
          />
          New candidate photo
        </label>
        <label>
          <input
            type="radio"
            name="source"
            value="carousel_candidate"
            checked={source === "carousel_candidate"}
            onChange={() => setSource("carousel_candidate")}
          />
          Carousel candidate
        </label>
      </div>
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {error && <p>Error: {error}</p>}

      <h2>Stored Photos</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 200px)", gap: "16px" }}>
        {photos.map((photo) => (
          <div key={photo.id}>
            <img
              src={photo.public_url}
              alt={photo.storage_path}
              width={200}
              height={200}
              style={{ objectFit: "cover" }}
            />
            <p>source: {photo.source ?? "(none)"}</p>
            {photo.source === "existing_feed" && (
              <p>grid_position: {photo.grid_position ?? "(none)"}</p>
            )}
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "10px" }}>
              {photo.analysis ? JSON.stringify(photo.analysis, null, 2) : "(no analysis yet)"}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
