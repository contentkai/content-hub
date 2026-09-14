"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AestheticProfile = {
  tags: string[];
  description: string;
};

type TargetProfile = {
  summary: string;
};

type Photo = {
  id: number;
  public_url: string;
  analysis: Record<string, unknown>;
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

  const [targetProfile, setTargetProfile] = useState<TargetProfile | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");

  const [inspoFile, setInspoFile] = useState<File | null>(null);
  const [inspoUploading, setInspoUploading] = useState(false);
  const [inspoError, setInspoError] = useState("");

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
        setTargetProfile(targetRows[0].summary as TargetProfile);
      }
    }
    load();
  }, []);

  async function handleUploadInspo() {
    if (!inspoFile) return;
    setInspoUploading(true);
    setInspoError("");

    const storagePath = `${Date.now()}-${inspoFile.name}`;

    const { error: uploadErr } = await supabase.storage.from("photos").upload(storagePath, inspoFile);
    if (uploadErr) {
      setInspoError(uploadErr.message);
      setInspoUploading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("photos").getPublicUrl(storagePath);

    const { data: insertData, error: insertError } = await supabase
      .from("photos")
      .insert({
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        source: "inspo",
        grid_position: null,
        existing_caption: null,
      })
      .select()
      .single();
    if (insertError) {
      setInspoError(insertError.message);
      setInspoUploading(false);
      return;
    }

    const uploadedFile = inspoFile;
    setInspoFile(null);
    setInspoUploading(false);

    const formData = new FormData();
    formData.append("image", uploadedFile);

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
      } else {
        setInspoError(data.error ?? "Vision analysis failed");
      }
    } catch (err) {
      setInspoError(String(err));
    }
  }

  async function handleGenerateTarget() {
    setTargetLoading(true);
    setTargetError("");

    const { data: inspoPhotos, error: inspoErr } = await supabase
      .from("photos")
      .select("analysis")
      .eq("source", "inspo")
      .not("analysis", "is", null);

    if (inspoErr) {
      setTargetError(inspoErr.message);
      setTargetLoading(false);
      return;
    }

    if (!inspoPhotos || inspoPhotos.length === 0) {
      setTargetError("No inspo photos with analysis found");
      setTargetLoading(false);
      return;
    }

    const res = await fetch("/api/target-aesthetic-summary", {
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

    let newTarget: TargetProfile;
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
        <h2>Target aesthetic</h2>

        {targetProfile && (
          <p className="quote prose content-block">Target aesthetic: {targetProfile.summary}</p>
        )}

        <div className="content-block" style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-start" }}>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setInspoFile(e.target.files?.[0] ?? null)}
          />
          <button onClick={handleUploadInspo} disabled={!inspoFile || inspoUploading} className="link">
            {inspoUploading ? "Uploading…" : "Upload inspo photo"}
          </button>
          {inspoError && <p className="text-secondary" style={{ fontSize: "13px" }}>{inspoError}</p>}
        </div>

        <div className="content-block">
          <button onClick={handleGenerateTarget} disabled={targetLoading} className="link">
            {targetLoading ? "Generating…" : "Generate target aesthetic"}
          </button>
          {targetError && <p className="text-secondary label-block">{targetError}</p>}
        </div>
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
