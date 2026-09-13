"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CaptionWriter from "@/components/CaptionWriter";
import {
  fetchNextPostRecommendation,
  type CandidatePhoto,
  type Recommendation,
} from "@/lib/nextPostRecommendation";

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chosenPhoto, setChosenPhoto] = useState<CandidatePhoto | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");

      const result = await fetchNextPostRecommendation();

      if (!result.ok) {
        setError(result.error);
      } else {
        setRecommendation(result.recommendation);
        setChosenPhoto(result.chosenPhoto);
      }

      setLoading(false);
    }
    load();
  }, []);

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "32px 16px", textAlign: "center" }}>
      {loading && <p style={{ color: "#888" }}>Finding today&apos;s recommendation...</p>}
      {error && <p style={{ color: "#888" }}>{error}</p>}

      {recommendation && recommendation.recommend && chosenPhoto && (
        <div>
          <img
            src={chosenPhoto.public_url}
            alt={`Photo ${chosenPhoto.id}`}
            style={{ width: "100%", display: "block" }}
          />
          <p style={{ color: "#555", marginTop: "16px" }}>{recommendation.why}</p>
          <div style={{ marginTop: "12px" }}>
            <CaptionWriter analysis={chosenPhoto.analysis} limit={1} />
          </div>
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <p style={{ color: "#555" }}>{recommendation.reason}</p>
      )}

      <div
        style={{
          marginTop: "32px",
          display: "flex",
          gap: "12px",
          justifyContent: "center",
          fontSize: "14px",
        }}
      >
        <Link href="/carousel">Build a carousel</Link>
        <Link href="/grid">Grid</Link>
      </div>
    </div>
  );
}
