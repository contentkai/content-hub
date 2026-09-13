"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
            style={{ width: "100%", display: "block", background: "var(--surface)" }}
          />

          <div className="content-block">
            <p className="label fade-in">Why</p>
            <p className="headline prose fade-in label-block">{recommendation.why}</p>
          </div>

          <div className="content-block">
            <CaptionWriter analysis={chosenPhoto.analysis} primary />
          </div>

          <div className="content-block">
            <SuggestEdits
              photoId={chosenPhoto.id}
              publicUrl={chosenPhoto.public_url}
              analysis={chosenPhoto.analysis}
            />
          </div>

          <div
            className="hairline-top section-block"
            style={{ paddingTop: "24px", display: "flex", gap: "24px" }}
          >
            <Link href="/carousel" className="link">
              Build a carousel
            </Link>
            <Link href="/upload" className="link">
              Upload photos
            </Link>
          </div>
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <div>
          <p className="label">Why</p>
          <p className="headline prose label-block">{recommendation.reason}</p>
          <div
            className="hairline-top section-block"
            style={{ paddingTop: "24px", display: "flex", gap: "24px" }}
          >
            <Link href="/carousel" className="link">
              Build a carousel
            </Link>
            <Link href="/upload" className="link">
              Upload photos
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
