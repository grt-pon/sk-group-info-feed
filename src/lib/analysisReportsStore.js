import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * 分析レポート(analysis_reports)を新しい順で返す。
 * reportType: "weekly_analysis"(scripts/analyzeReactions.jsが週次で書き込む、反応傾向の分析)
 *             "impression"(scripts/generateImpressionReport.jsが日次で書き込む、アクセス状況レポート)
 * @param {string} reportType
 * @returns {Promise<Array<{ id: string, createdAt: string, content: string }>>}
 */
export async function listAnalysisReports(reportType = "weekly_analysis") {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .eq("report_type", reportType)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    content: row.content
  }));
}

/**
 * 分析レポートを1件保存する。
 * @param {string} reportType
 * @param {string} content
 */
export async function saveAnalysisReport(reportType, content) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("analysis_reports").insert({ report_type: reportType, content });
  if (error) throw error;
}
