import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/analysis-reports — 分析レポートを新しい順で返す(読み取り専用)。
 * ?type=weekly_analysis(週次のリアクション傾向分析)/impression(アクセス状況レポート)で絞り込める。
 * 省略時はweekly_analysisを返す(既存の「分析レポート」表示との互換のため)。
 */
export async function onRequestGet(context) {
  const { env, request } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const url = new URL(request.url);
  const reportType = url.searchParams.get("type") || "weekly_analysis";

  const { data, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .eq("report_type", reportType)
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
