import { matchCategoriesByRule } from "../config/categoryRules.js";
import { summarizeAndClassify, isSameStory, extractPricePoints } from "../lib/claudeClient.js";
import { existsByUrl, saveItem, listItems, savePricePoints } from "../lib/store.js";
import { findSimilarCandidates } from "../lib/titleSimilarity.js";

// 1回の収集実行(node scripts/runOnce.js)の中で、既存タイトルの一覧を使い回すためのキャッシュ。
// 同じ実行内で追加された記事(例: 同じプレスリリースが別サイトに転載されたもの)も
// 比較対象に含められるよう、保存するたびにこのキャッシュへも追記する。
let titleCache = null;

async function getTitleCache() {
  if (!titleCache) {
    const items = await listItems();
    titleCache = items.map((item) => ({ id: item.id, title: item.title }));
  }
  return titleCache;
}

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
  const {
    title: cleanTitle,
    summary,
    categories,
    isNewsworthy,
    isImportant,
    region,
    sourceType,
    isPaywalled
  } = await summarizeAndClassify({
    title,
    rawText,
    ruleCategories
  });

  if (!isNewsworthy) {
    return { skipped: true, reason: "not_newsworthy" };
  }

  // URLが違っても、同じプレスリリースが別サイトに転載されただけのケースをここで弾く。
  const cache = await getTitleCache();
  const candidates = findSimilarCandidates(cleanTitle, cache);
  for (const candidate of candidates) {
    const same = await isSameStory({ titleA: cleanTitle, titleB: candidate.title });
    if (same) {
      return { skipped: true, reason: "similar_title_duplicate" };
    }
  }

  const itemId = await saveItem({
    title: cleanTitle,
    summary,
    sourceUrl,
    sourceId,
    sourceName,
    isPrimarySource,
    categories,
    publishedAt,
    isImportant,
    region,
    sourceType,
    isPaywalled
  });

  cache.push({ id: itemId, title: cleanTitle });

  // 相場推移グラフ用に、品目別の価格を抽出して別テーブルに保存する。
  // コストを抑えるため「資源相場」カテゴリが付いた記事に対してのみ呼び出す。
  if (categories.includes("資源相場")) {
    try {
      const pricePoints = await extractPricePoints({ title: cleanTitle, rawText });
      await savePricePoints(itemId, pricePoints);
    } catch (err) {
      console.error(`[price-points] 抽出・保存に失敗しました(記事は保存済み): ${err.message}`);
    }
  }

  return { skipped: false, itemId };
}
