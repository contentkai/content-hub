import { supabase } from "@/lib/supabase";

export type CandidatePhoto = {
  id: number;
  public_url: string;
  analysis: Record<string, unknown>;
};

export type Recommendation = {
  recommend: boolean;
  photo_id: string | null;
  why: string;
  reason: string | null;
};

export type NextPostResult =
  | { ok: true; recommendation: Recommendation; chosenPhoto: CandidatePhoto | null }
  | { ok: false; error: string };

export async function fetchNextPostRecommendation(): Promise<NextPostResult> {
  const { data: candidates, error: candidatesError } = await supabase
    .from("photos")
    .select("id, public_url, analysis")
    .eq("source", "new_candidate")
    .not("analysis", "is", null);

  if (candidatesError) return { ok: false, error: candidatesError.message };
  if (!candidates || candidates.length === 0) {
    return { ok: false, error: "No candidate photos with analysis found" };
  }

  const { data: profileRows, error: profileError } = await supabase
    .from("aesthetic_profile")
    .select("summary")
    .order("id", { ascending: false })
    .limit(1);

  if (profileError) return { ok: false, error: profileError.message };
  const aestheticProfile = profileRows?.[0]?.summary ?? null;

  const { data: recentPosts, error: recentError } = await supabase
    .from("photos")
    .select("id, grid_position, analysis")
    .eq("source", "existing_feed")
    .not("grid_position", "is", null)
    .order("grid_position", { ascending: true })
    .limit(3);

  if (recentError) return { ok: false, error: recentError.message };

  const res = await fetch("/api/next-post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidates: candidates.map((c) => ({ id: c.id, analysis: c.analysis })),
      aestheticProfile,
      recentPosts,
    }),
  });
  const data = await res.json();

  if (!res.ok) return { ok: false, error: data.error ?? "Request failed" };

  let recommendation: Recommendation;
  try {
    recommendation = JSON.parse(data.result);
  } catch {
    return { ok: false, error: "Model did not return valid JSON: " + data.result };
  }

  let chosenPhoto: CandidatePhoto | null = null;
  if (recommendation.recommend && recommendation.photo_id) {
    chosenPhoto =
      (candidates as CandidatePhoto[]).find((c) => String(c.id) === recommendation.photo_id) ?? null;
  }

  return { ok: true, recommendation, chosenPhoto };
}
