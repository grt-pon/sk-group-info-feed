import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("id, title, published_at, collected_at, reactions");
  if (itemsErr) throw itemsErr;

  const reactions = items.flatMap((it) =>
    (it.reactions ?? []).map((r) => ({ item_id: it.id, judgement: r.judgement, user_id: r.userId }))
  );

  const { data: feedback, error: fbErr } = await supabase
    .from("feedback")
    .select("id, department, name, content, created_at, replies");
  if (fbErr) throw fbErr;

  let analysisReports = [];
  try {
    const { data, error } = await supabase
      .from("analysis_reports")
      .select("id, created_at, content")
      .order("created_at", { ascending: false });
    if (!error) analysisReports = data;
  } catch {
    // table may not exist in some envs
  }

  console.log(`=== 記事 ===`);
  console.log(`総件数: ${items.length}`);
  const sorted = [...items].sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at));
  console.log(`直近登録5件:`);
  for (const it of sorted.slice(0, 5)) {
    console.log(`  - [${it.collected_at}] ${it.title}`);
  }

  console.log(`\n=== リアクション ===`);
  console.log(`総リアクション数(行数): ${reactions.length}`);
  const byItem = new Map();
  for (const r of reactions) {
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, { want: new Set(), notWant: new Set() });
    const entry = byItem.get(r.item_id);
    if (r.judgement === "want") entry.want.add(r.user_id);
    else entry.notWant.add(r.user_id);
  }
  const itemTitleById = new Map(items.map((it) => [it.id, it.title]));
  const ranked = [...byItem.entries()]
    .map(([id, v]) => ({ id, title: itemTitleById.get(id) || "(不明)", want: v.want.size, notWant: v.notWant.size, total: v.want.size + v.notWant.size }))
    .sort((a, b) => b.total - a.total);
  console.log(`リアクションが付いた記事数: ${ranked.length} / ${items.length}`);
  console.log(`リアクション数トップ10:`);
  for (const r of ranked.slice(0, 10)) {
    console.log(`  👍${r.want} 👎${r.notWant}  ${r.title}`);
  }
  const totalWant = ranked.reduce((s, r) => s + r.want, 0);
  const totalNotWant = ranked.reduce((s, r) => s + r.notWant, 0);
  console.log(`\n👍合計: ${totalWant}  👎合計: ${totalNotWant}`);

  console.log(`\n=== フィードバック(FB) ===`);
  console.log(`FB件数: ${feedback.length}`);
  for (const f of feedback) {
    const replyCount = Array.isArray(f.replies) ? f.replies.length : 0;
    console.log(`  - [${f.created_at}] ${f.department} / ${f.name}: ${(f.content || "").slice(0, 60)} (返信${replyCount}件)`);
  }

  console.log(`\n=== 分析レポート(週次AI分析) ===`);
  console.log(`レポート件数: ${analysisReports.length}`);
  for (const r of analysisReports) {
    console.log(`  - [${r.created_at}]`);
    console.log(`    ${(r.content || "").slice(0, 200).replace(/\n/g, " ")}...`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
