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
    <div style={{ maxWidth: "640px", margin: "0 auto", width: "100%" }}>
      {loading && (
        <p className="text-secondary" style={{ padding: "24px 20px", fontSize: "14px" }}>
          Finding today&apos;s recommendation…
        </p>
      )}
      {error && (
        <p className="text-secondary" style={{ padding: "24px 20px", fontSize: "14px" }}>
          {error}
        </p>
      )}

      {recommendation && recommendation.recommend && chosenPhoto && (
        <div>
          <img
            src={chosenPhoto.public_url}
            alt={`Photo ${chosenPhoto.id}`}
            className="fade-in"
            style={{ width: "100%", display: "block", background: "var(--surface)" }}
          />
          <div style={{ padding: "24px 20px 0" }}>
            <p className="label-accent fade-in">Why</p>
            <p className="serif fade-in" style={{ fontSize: "20px", lineHeight: 1.5, fontWeight: 400 }}>
              {recommendation.why}
            </p>

            <div style={{ marginTop: "24px" }}>
              <CaptionWriter analysis={chosenPhoto.analysis} primary />
            </div>

            <div style={{ marginTop: "16px" }}>
              <SuggestEdits
                photoId={chosenPhoto.id}
                publicUrl={chosenPhoto.public_url}
                analysis={chosenPhoto.analysis}
              />
            </div>

            <div
              className="hairline-top"
              style={{ marginTop: "32px", paddingTop: "16px", display: "flex", gap: "20px" }}
            >
              <Link href="/carousel" className="link">
                Build a carousel
              </Link>
              <Link href="/upload" className="link">
                Upload photos
              </Link>
            </div>
          </div>
        </div>
      )}

      {recommendation && !recommendation.recommend && (
        <div style={{ padding: "24px 20px 0" }}>
          <p className="label-accent">Why</p>
          <p className="serif" style={{ fontSize: "20px", lineHeight: 1.5, fontWeight: 400 }}>
            {recommendation.reason}
          </p>
          <div
            className="hairline-top"
            style={{ marginTop: "32px", paddingTop: "16px", display: "flex", gap: "20px" }}
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
