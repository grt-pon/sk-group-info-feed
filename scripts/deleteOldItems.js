import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// 2025年より前の記事を一括削除する一回限りのスクリプト。
// publishedAtがnull(日付不明)の記事は誤って新しい記事を消さないよう対象外とする。
const CUTOFF = "2025-01-01T00:00:00.000Z";

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: toDelete, error: selectError } = await supabase
    .from("items")
    .select("id, title, published_at")
    .lt("published_at", CUTOFF);

  if (selectError) throw selectError;

  console.log(`削除対象: ${toDelete.length}件`);
  for (const item of toDelete) {
    console.log(`  - [${item.published_at}] ${item.title}`);
  }

  if (toDelete.length === 0) return;

  const { error: deleteError } = await supabase.from("items").delete().lt("published_at", CUTOFF);
  if (deleteError) throw deleteError;

  console.log("削除完了");
}

main();
