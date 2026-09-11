"use client";

import { useState } from "react";

export default function TestVisionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResult("");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
      } else {
        setResult(data.result);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Test Vision</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={handleAnalyze} disabled={!file || loading}>
        {loading ? "Analyzing..." : "Analyze"}
      </button>
      {error && <p>Error: {error}</p>}
      {result && <pre>{result}</pre>}
    </div>
  );
}
