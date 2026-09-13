"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type AestheticProfile = {
  tags: string[];
  description: string;
};

type Photo = {
  id: number;
  public_url: string;
  analysis: Record<string, unknown>;
};

type PreferenceAnswer = {
  axis: string;
  question: string;
  chosen_photo_id: number;
};

type QuizQuestion = {
  done: false;
  axis: string;
  question: string;
  photoA: Photo;
  photoB: Photo;
};

type QuizState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done" }
  | { status: "answered" }
  | ({ status: "question" } & QuizQuestion);

export default function InsightsPage() {
  const [currentProfile, setCurrentProfile] = useState<AestheticProfile | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentError, setCurrentError] = useState("");

  const [targetProfile, setTargetProfile] = useState<AestheticProfile | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");

  const [quiz, setQuiz] = useState<QuizState>({ status: "idle" });

  useEffect(() => {
    async function load() {
      const { data: profileRows } = await supabase
        .from("aesthetic_profile")
        .select("summary")
        .order("id", { ascending: false })
        .limit(1);
      if (profileRows && profileRows.length > 0) {
        setCurrentProfile(profileRows[0].summary as AestheticProfile);
      }

      const { data: targetRows } = await supabase
        .from("target_aesthetic_profile")
        .select("summary")
        .order("id", { ascending: false })
        .limit(1);
      if (targetRows && targetRows.length > 0) {
        setTargetProfile(targetRows[0].summary as AestheticProfile);
      }
    }
    load();
  }, []);

  async function handleGenerateCurrent() {
    setCurrentLoading(true);
    setCurrentError("");

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("analysis")
      .eq("source", "existing_feed")
      .not("analysis", "is", null);

    if (photosError) {
      setCurrentError(photosError.message);
      setCurrentLoading(false);
      return;
    }

    if (!photos || photos.length === 0) {
      setCurrentError("No existing_feed photos with analysis found");
      setCurrentLoading(false);
      return;
    }

    const { data: preferenceAnswers } = await supabase
      .from("preference_answers")
      .select("axis, question, chosen_photo_id");

    const res = await fetch("/api/aesthetic-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analyses: photos.map((p) => p.analysis),
        preferenceAnswers: preferenceAnswers ?? [],
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setCurrentError(data.error ?? "Request failed");
      setCurrentLoading(false);
      return;
    }

    let newSummary: AestheticProfile;
    try {
      newSummary = JSON.parse(data.result);
    } catch {
      setCurrentError("Model did not return valid JSON: " + data.result);
      setCurrentLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("aesthetic_profile")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from("aesthetic_profile").update({ summary: newSummary }).eq("id", existing[0].id);
    } else {
      await supabase.from("aesthetic_profile").insert({ summary: newSummary });
    }

    setCurrentProfile(newSummary);
    setCurrentLoading(false);
  }

  async function handleGenerateTarget() {
    setTargetLoading(true);
    setTargetError("");

    const { data: inspoPhotos, error: inspoError } = await supabase
      .from("photos")
      .select("analysis")
      .eq("source", "inspo")
      .not("analysis", "is", null);

    if (inspoError) {
      setTargetError(inspoError.message);
      setTargetLoading(false);
      return;
    }

    if (!inspoPhotos || inspoPhotos.length === 0) {
      setTargetError("No inspo photos with analysis found");
      setTargetLoading(false);
      return;
    }

    const res = await fetch("/api/aesthetic-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyses: inspoPhotos.map((p) => p.analysis) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setTargetError(data.error ?? "Request failed");
      setTargetLoading(false);
      return;
    }

    let newTarget: AestheticProfile;
    try {
      newTarget = JSON.parse(data.result);
    } catch {
      setTargetError("Model did not return valid JSON: " + data.result);
      setTargetLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("target_aesthetic_profile")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("target_aesthetic_profile")
        .update({ summary: newTarget })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("target_aesthetic_profile").insert({ summary: newTarget });
    }

    setTargetProfile(newTarget);
    setTargetLoading(false);
  }

  async function handleAskQuestion() {
    setQuiz({ status: "loading" });

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("id, public_url, analysis")
      .not("analysis", "is", null);

    if (photosError) {
      setQuiz({ status: "error", message: photosError.message });
      return;
    }

    if (!photos || photos.length < 2) {
      setQuiz({ status: "error", message: "Not enough analyzed photos yet to ask a question" });
      return;
    }

    const { data: priorAnswers } = await supabase
      .from("preference_answers")
      .select("axis, question, chosen_photo_id");

    const res = await fetch("/api/preference-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos: photos.map((p) => ({ id: p.id, analysis: p.analysis })),
        aestheticProfile: currentProfile,
        priorAnswers: priorAnswers ?? [],
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setQuiz({ status: "error", message: data.error ?? "Request failed" });
      return;
    }

    let parsed: { done: boolean; axis?: string; question?: string; photo_a_id?: string; photo_b_id?: string };
    try {
      parsed = JSON.parse(data.result);
    } catch {
      setQuiz({ status: "error", message: "Model did not return valid JSON: " + data.result });
      return;
    }

    if (parsed.done) {
      setQuiz({ status: "done" });
      return;
    }

    const photoA = (photos as Photo[]).find((p) => String(p.id) === parsed.photo_a_id);
    const photoB = (photos as Photo[]).find((p) => String(p.id) === parsed.photo_b_id);

    if (!photoA || !photoB || !parsed.axis || !parsed.question) {
      setQuiz({ status: "error", message: "Model referenced photos that weren't found" });
      return;
    }

    setQuiz({ status: "question", done: false, axis: parsed.axis, question: parsed.question, photoA, photoB });
  }

  async function handleSelectPhoto(chosen: Photo, axis: string, question: string) {
    await supabase.from("preference_answers").insert({
      axis,
      question,
      chosen_photo_id: chosen.id,
    });
    setQuiz({ status: "answered" });
  }

  return (
    <div className="page">
      <h1>My Insights</h1>

      <div className="section-block">
        <h2>Your current aesthetic</h2>
        <div className="content-block">
          <button onClick={handleGenerateCurrent} disabled={currentLoading} className="btn-primary">
            {currentLoading ? "Generating…" : "Generate aesthetic profile"}
          </button>
          {currentError && <p className="text-secondary label-block">{currentError}</p>}
        </div>
        {currentProfile && (
          <>
            <p className="text-secondary content-block" style={{ fontSize: "13px" }}>
              {currentProfile.tags.join(" · ")}
            </p>
            <p className="quote prose label-block">{currentProfile.description}</p>
          </>
        )}
      </div>

      <div className="section-block">
        <h2>Your target aesthetic</h2>
        <div className="content-block" style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <button onClick={handleGenerateTarget} disabled={targetLoading} className="link">
            {targetLoading ? "Generating…" : "Generate target aesthetic"}
          </button>
          <Link href="/upload" className="link">
            Add inspo photos
          </Link>
        </div>
        {targetError && <p className="text-secondary label-block">{targetError}</p>}
        {targetProfile && (
          <>
            <p className="text-secondary content-block" style={{ fontSize: "13px" }}>
              {targetProfile.tags.join(" · ")}
            </p>
            <p className="quote prose label-block">{targetProfile.description}</p>
          </>
        )}
      </div>

      <div className="section-block">
        <h2>Help me understand your taste</h2>

        {quiz.status === "idle" && (
          <div className="content-block">
            <button onClick={handleAskQuestion} className="btn-primary">
              Ask me a question
            </button>
          </div>
        )}

        {quiz.status === "loading" && (
          <p className="text-secondary content-block">Thinking of a question…</p>
        )}

        {quiz.status === "error" && (
          <div className="content-block">
            <p className="text-secondary">{quiz.message}</p>
            <div className="content-block">
              <button onClick={handleAskQuestion} className="link">
                Try again
              </button>
            </div>
          </div>
        )}

        {quiz.status === "done" && (
          <div className="content-block">
            <p className="quote prose">Your taste profile feels well-defined right now.</p>
            <div className="content-block">
              <button onClick={handleAskQuestion} className="link">
                Ask me a question
              </button>
            </div>
          </div>
        )}

        {quiz.status === "answered" && (
          <div className="content-block">
            <p className="text-secondary">Got it — thanks.</p>
            <div className="content-block">
              <button onClick={handleAskQuestion} className="btn-primary">
                Ask another
              </button>
            </div>
          </div>
        )}

        {quiz.status === "question" && (
          <div className="content-block">
            <p className="label">{quiz.axis}</p>
            <p className="headline prose label-block">{quiz.question}</p>

            <div className="content-block" style={{ display: "flex", gap: "24px" }}>
              {[quiz.photoA, quiz.photoB].map((photo) => (
                <div key={photo.id} style={{ flex: "1 1 0" }}>
                  <img
                    src={photo.public_url}
                    alt={`Photo ${photo.id}`}
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      display: "block",
                      background: "var(--surface)",
                    }}
                  />
                  <div className="label-block">
                    <button
                      onClick={() => handleSelectPhoto(photo, quiz.axis, quiz.question)}
                      className="link"
                    >
                      This one
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
