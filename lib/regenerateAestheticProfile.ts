import { supabase } from "@/lib/supabase";

export async function regenerateAestheticProfile(): Promise<void> {
  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("analysis")
    .eq("source", "existing_feed")
    .not("analysis", "is", null);

  if (photosError || !photos || photos.length === 0) return;

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
  if (!res.ok) return;
  const data = await res.json();

  let newSummary: unknown;
  try {
    newSummary = JSON.parse(data.result);
  } catch {
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
}
