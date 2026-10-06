import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchPublishedDate } from "../src/lib/articleFetcher.js";

// publishedAtがnullの既存記事に対して、リンク先ページのmeta情報から公開日を探し、
// 見つかったものだけ更新する一回限りのスクリプト(articleFetcher.jsの日付抽出フォールバック導入に伴う遡及適用)。
async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, source_url")
    .is("published_at", null);
  if (error) throw error;

  console.log(`対象: ${items.length}件`);
  let updated = 0;
  for (const item of items) {
    const publishedAt = await fetchPublishedDate(item.source_url);
    if (!publishedAt) {
      console.log(`  [not found] ${item.title}`);
      continue;
    }
    const { error: updateError } = await supabase
      .from("items")
      .update({ published_at: publishedAt })
      .eq("id", item.id);
    if (updateError) {
      console.error(`  [update failed] ${item.title}: ${updateError.message}`);
      continue;
    }
    console.log(`  [updated] ${item.title} -> ${publishedAt}`);
    updated++;
  }

  console.log(`\n更新件数: ${updated}/${items.length}`);
}

main();
