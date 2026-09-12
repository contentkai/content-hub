"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Photo = {
  id: string;
  storage_path: string;
  public_url: string;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
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

    const { error: insertError } = await supabase.from("photos").insert({
      storage_path: storagePath,
      public_url: publicUrlData.publicUrl,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    setFile(null);
    setUploading(false);
    await loadPhotos();
  }

  return (
    <div>
      <h1>Upload</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={handleUpload} disabled={!file || uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
      {error && <p>Error: {error}</p>}

      <h2>Stored Photos</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 120px)", gap: "8px" }}>
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.public_url}
            alt={photo.storage_path}
            width={120}
            height={120}
            style={{ objectFit: "cover" }}
          />
        ))}
      </div>
    </div>
  );
}
