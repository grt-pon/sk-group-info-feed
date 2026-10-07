import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/analysis-reports — 週次分析レポートを新しい順で返す(読み取り専用)。
 */
export async function onRequestGet(context) {
  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const reports = (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    content: row.content
  }));

  return jsonResponse(reports);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
