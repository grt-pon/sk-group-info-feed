import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/pageview — サイトを開いた回数を1件記録する(インプレッション分析レポート用)。
 * 通知等は行わず、scripts/generateImpressionReport.js が定期的に集計してレポート化する。
 */
export async function onRequestPost(context) {
  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from("page_views").insert({});
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
