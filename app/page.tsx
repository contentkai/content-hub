"use client";

import { useEffect, useState } from "react";
import CaptionWriter from "@/components/CaptionWriter";
import SuggestEdits from "@/components/SuggestEdits";
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
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const result = await fetchNextPostRecommendation();
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
      } else {
        setRecommendation(result.recommendation);
        setChosenPhoto(result.chosenPhoto);
      }

      setLoading(false);
    }
    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      {loading && (
        <p className="text-secondary content-block">Finding today&apos;s recommendation…</p>
      )}
      {error && <p className="text-secondary content-block">{error}</p>}

      {recommendation && recommendation.recommend && chosenPhoto && (
        <div>
          <img
            src={chosenPhoto.public_url}
            alt={`Photo ${chosenPhoto.id}`}
            className="fade-in"
            style={{
              display: "block",
              margin: "0 auto",
              maxWidth: "320px",
              width: "100%",
              background: "var(--surface)",
            }}
          />

          <div style={{ marginTop: "16px" }}>
            <p className="label fade-in">Why</p>
            <p
              className="fade-in"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 500,
                fontSize: "18px",
                lineHeight: 1.4,
                marginTop: "6px",
                maxWidth: "60ch",
              }}
            >
              {recommendation.why}
            </p>
          </div>

          <div className="content-block" style={{ display: "flex", gap: "24px" }}>
            <SuggestEdits
              photoId={chosenPhoto.id}
              publicUrl={chosenPhoto.public_url}
              analysis={chosenPhoto.analysis}
            />
            <CaptionWriter analysis={chosenPhoto.analysis} />
          </div>
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <div>
          <p className="label">Why</p>
          <p className="headline prose label-block">{recommendation.reason}</p>
        </div>
      )}
    </div>
  );
}
