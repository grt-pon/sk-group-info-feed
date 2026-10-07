import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * 週次分析レポート(analysis_reports)を新しい順で返す。scripts/analyzeReactions.jsが書き込む。
 * @returns {Promise<Array<{ id: string, createdAt: string, content: string }>>}
 */
export async function listAnalysisReports() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("analysis_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    content: row.content
  }));
}
