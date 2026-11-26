import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/items/:id/view — 記事の閲覧回数を1増やす。
 * 「社内で注目されているニュース」ランキング(閲覧回数ベース)の集計元データとして使う。
 */
export async function onRequestPost(context) {
  const { env, params } = context;
  const id = params.id;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: readError } = await supabase.from("items").select("view_count").eq("id", id).single();
  if (readError) {
    return jsonResponse({ error: readError.message }, 404);
  }

  const { error: writeError } = await supabase
    .from("items")
    .update({ view_count: (row.view_count ?? 0) + 1 })
    .eq("id", id);
  if (writeError) {
    return jsonResponse({ error: writeError.message }, 500);
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
