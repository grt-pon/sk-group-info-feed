import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// 日次で実行し、サイトのアクセス状況(インプレッション)を集計してレポート化する。
// 通知は行わず、「分析レポート」側の新しいタブ(アクセスレポート)で見たい時に確認する運用。
// 数値の集計だけなのでAIは使わず、確定的な値をそのままレポート文にする
// (AI要約を挟むと数字が不正確になるリスクがあるため)。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstDateKey(isoString) {
  const jst = new Date(new Date(isoString).getTime() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}

function toJstHour(isoString) {
  const jst = new Date(new Date(isoString).getTime() + JST_OFFSET_MS);
  return jst.getUTCHours();
}

function bar(count, max, width = 20) {
  if (max === 0) return "";
  const len = Math.round((count / max) * width);
  return "■".repeat(len) + "・".repeat(width - len);
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("page_views")
    .select("viewed_at")
    .gte("viewed_at", since);
  if (error) throw error;

  const views = data ?? [];
  const todayKey = toJstDateKey(new Date().toISOString());

  // 日別の閲覧回数(直近14日)
  const byDate = new Map();
  for (const v of views) {
    const key = toJstDateKey(v.viewed_at);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  const sortedDates = [...byDate.keys()].sort();
  const todayCount = byDate.get(todayKey) ?? 0;

  // 本日の時間帯別(0〜23時、JST)の閲覧回数
  const byHour = new Array(24).fill(0);
  for (const v of views) {
    if (toJstDateKey(v.viewed_at) === todayKey) {
      byHour[toJstHour(v.viewed_at)]++;
    }
  }
  const maxHourCount = Math.max(...byHour, 1);

  const dateLines = sortedDates
    .map((d) => `  ${d}${d === todayKey ? "(本日)" : ""}: ${byDate.get(d)}回`)
    .join("\n");

  const hourLines = byHour
    .map((count, hour) => `  ${String(hour).padStart(2, "0")}時台: ${bar(count, maxHourCount)} ${count}回`)
    .join("\n");

  const report = `## アクセスレポート(${todayKey}時点)

### 本日の閲覧回数
${todayCount}回

### 直近14日間の推移
${dateLines || "  (データなし)"}

### 本日の時間帯別アクセス(JST)
${hourLines}
`;

  const { error: insertError } = await supabase
    .from("analysis_reports")
    .insert({ content: report, report_type: "impression" });
  if (insertError) throw insertError;

  console.log("アクセスレポートを保存しました。");
  console.log(report);
}

main();
