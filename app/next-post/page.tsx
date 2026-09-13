"use client";

import { useState } from "react";
import CaptionWriter from "@/components/CaptionWriter";
import SuggestEdits from "@/components/SuggestEdits";
import {
  fetchNextPostRecommendation,
  type CandidatePhoto,
  type Recommendation,
} from "@/lib/nextPostRecommendation";

export default function NextPostPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [chosenPhoto, setChosenPhoto] = useState<CandidatePhoto | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setRecommendation(null);
    setChosenPhoto(null);

    const result = await fetchNextPostRecommendation();

    if (!result.ok) {
      setError(result.error);
    } else {
      setRecommendation(result.recommendation);
      setChosenPhoto(result.chosenPhoto);
    }

    setLoading(false);
  }

  return (
    <div>
      <h1>Next Post</h1>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? "Thinking..." : "Get Next Post Recommendation"}
      </button>
      {error && <p>Error: {error}</p>}

      {recommendation && recommendation.recommend && chosenPhoto && (
        <div>
          <img
            src={chosenPhoto.public_url}
            alt={`Photo ${chosenPhoto.id}`}
            style={{ maxWidth: "500px", width: "100%" }}
          />
          <p>{recommendation.why}</p>
          <CaptionWriter analysis={chosenPhoto.analysis} />
          <SuggestEdits
            photoId={chosenPhoto.id}
            publicUrl={chosenPhoto.public_url}
            analysis={chosenPhoto.analysis}
          />
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <p>{recommendation.reason}</p>
      )}
    </div>
  );
}
