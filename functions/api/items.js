import { createClient } from "@supabase/supabase-js";

// Cloudflare Pages Functions版のAPI。ローカル用のsrc/server.js(Express)とは実行環境が違うため
// (Node.jsではなくCloudflare Workersランタイム。process.envではなくcontext.envで環境変数を受け取る)、
// あえてsrc/lib/supabaseStore.jsとは共有せず、この中で完結させている。
// ロジック自体はsupabaseStore.jsのlistItems()と同じ。

/**
 * GET /api/items — 保存済みの全記事を返す。
 */
export async function onRequestGet(context) {
  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const NOT_WANT_HIDE_THRESHOLD = 3;

  const items = (data ?? [])
    .map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      sourceUrl: row.source_url,
      sourceId: row.source_id,
      sourceName: row.source_name,
      isPrimarySource: row.is_primary_source,
      categories: row.categories,
      publishedAt: row.published_at,
      collectedAt: row.collected_at,
      reactions: row.reactions ?? []
    }))
    // 「不要」が一定数以上ついた記事は、複数人の判断が揃ったとみなして非表示にする。
    // 同じ人の連打で非表示にならないよう、userId(ブラウザごとの簡易ID)の重複を除いて数える。
    .filter((item) => {
      const notWantUsers = new Set(item.reactions.filter((r) => r.judgement === "not_want").map((r) => r.userId));
      return notWantUsers.size < NOT_WANT_HIDE_THRESHOLD;
    });

  return jsonResponse(items);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
