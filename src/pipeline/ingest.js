import { matchCategoriesByRule } from "../config/categoryRules.js";
import { summarizeAndClassify } from "../lib/claudeClient.js";
import { existsByUrl, saveItem } from "../lib/store.js";

/**
 * 収集した1件の生データを、重複チェック→ルール分類→Claude要約/分類確定→保存、まで処理する。
 * 保存されるのは要約(独自生成)のみで、rawText(元記事全文)は保存しない。
 *
 * @param {{
 *   title: string,
 *   rawText: string,
 *   sourceUrl: string,
 *   sourceId: string,
 *   sourceName: string,
 *   isPrimarySource: boolean,
 *   publishedAt?: string | null
 * }} rawItem
 * @returns {Promise<{ skipped: true, reason: string } | { skipped: false, itemId: string }>}
 */
export async function ingestItem(rawItem) {
  const { title, rawText, sourceUrl, sourceId, sourceName, isPrimarySource, publishedAt = null } = rawItem;

  const alreadyExists = await existsByUrl(sourceUrl, publishedAt);
  if (alreadyExists) {
    return { skipped: true, reason: "duplicate" };
  }

  const ruleCategories = matchCategoriesByRule(`${title}\n${rawText}`);
  const { title: cleanTitle, summary, categories } = await summarizeAndClassify({ title, rawText, ruleCategories });

  const itemId = await saveItem({
    title: cleanTitle,
    summary,
    sourceUrl,
    sourceId,
    sourceName,
    isPrimarySource,
    categories,
    publishedAt
  });

  return { skipped: false, itemId };
}
