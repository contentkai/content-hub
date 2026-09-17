import { supabase } from "@/lib/supabase";

export async function uploadAndAnalyzePhoto(
  file: File,
  source: string,
  existingCaption: string | null = null
): Promise<{ id: number }> {
  const storagePath = `${Date.now()}-${file.name}`;

  const { error: uploadError } = await supabase.storage.from("photos").upload(storagePath, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage.from("photos").getPublicUrl(storagePath);

  // The shift-existing-rows-up + insert-at-position-1 sequence has to happen atomically —
  // doing it as separate client-side reads/updates races against any other upload happening
  // around the same time. insert_existing_feed_photo runs both steps inside a single Postgres
  // transaction instead. This also means batch uploads of existing_feed photos must be
  // processed sequentially, one at a time, not in parallel.
  let insertData: { id: number };
  if (source === "existing_feed") {
    const { data, error: insertError } = await supabase.rpc("insert_existing_feed_photo", {
      p_storage_path: storagePath,
      p_public_url: publicUrlData.publicUrl,
      p_existing_caption: existingCaption && existingCaption.trim() !== "" ? existingCaption.trim() : null,
    });
    if (insertError) throw new Error(insertError.message);
    insertData = data;
  } else {
    const { data, error: insertError } = await supabase
      .from("photos")
      .insert({
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        source,
        grid_position: null,
        existing_caption: null,
      })
      .select()
      .single();
    if (insertError) throw new Error(insertError.message);
    insertData = data;
  }

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch("/api/analyze-image", { method: "POST", body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Vision analysis failed");
  }

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(data.result);
  } catch {
    analysis = { error: "invalid JSON from model", raw: data.result };
  }
  await supabase.from("photos").update({ analysis }).eq("id", insertData.id);

  return insertData;
}
