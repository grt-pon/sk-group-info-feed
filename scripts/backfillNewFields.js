import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { classifyExistingItem, extractPricePoints } from "../src/lib/claudeClient.js";
import { fetchArticleText } from "../src/lib/articleFetcher.js";

// 2026-11-26に追加したregion/source_type/is_paywalled/is_importantを、既存記事に遡って付与する
// 一回限りのバックフィルスクリプト。元記事の全文は保存していないため、可能ならsource_urlを
// 再取得して判定材料にし、取得できない(リンク切れ・PDF等)場合は要約だけで判定する。
// 「資源相場」カテゴリの記事は、相場推移グラフ用に価格ポイントの抽出も合わせて行う。
// 失敗した記事は[skip-on-error]としてログに残し、処理自体は止めずに次へ進む(安全側の挙動)。

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: items, error } = await supabase
    .from("items")
    .select("id, title, summary, source_url, source_name, categories");
  if (error) throw error;

  console.log(`対象: ${items.length}件`);

  let done = 0;
  for (const item of items) {
    try {
      const rawText = await fetchArticleText(item.source_url).catch(() => null);

      const { region, sourceType, isPaywalled, isImportant } = await classifyExistingItem({
        title: item.title,
        summary: item.summary,
        sourceName: item.source_name,
        rawText
      });

      const { error: updateError } = await supabase
        .from("items")
        .update({
          region,
          source_type: sourceType,
          is_paywalled: isPaywalled,
          is_important: isImportant
        })
        .eq("id", item.id);
      if (updateError) throw updateError;

      if ((item.categories || []).includes("資源相場")) {
        try {
          const points = await extractPricePoints({
            title: item.title,
            rawText: rawText || item.summary
          });
          if (points.length > 0) {
            const rows = points.map((p) => ({
              item_id: item.id,
              commodity: p.commodity,
              price: p.price,
              unit: p.unit ?? null,
              price_date: p.priceDate ?? new Date().toISOString().slice(0, 10)
            }));
            const { error: priceError } = await supabase.from("price_points").insert(rows);
            if (priceError) throw priceError;
          }
        } catch (priceErr) {
          console.error(`  [price-points skip-on-error] ${item.title}: ${priceErr.message}`);
        }
      }

      done++;
      console.log(`  [${done}/${items.length}] ${region}/${sourceType}${isPaywalled ? "/有料" : ""}${isImportant ? "/重要" : ""} ${item.title}`);
    } catch (err) {
      console.error(`  [skip-on-error] ${item.title}: ${err.message}`);
    }
  }

  console.log("完了しました。");
}

main();
