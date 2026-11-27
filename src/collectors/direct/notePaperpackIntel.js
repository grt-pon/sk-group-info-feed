import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { fetchArticleText } from "../../lib/articleFetcher.js";

export const SOURCE_ID = "note-paperpack-intel";
export const SOURCE_NAME = "note(paperpack_intel)";
const FEED_URL = "https://note.com/paperpack_intel/rss";

/**
 * note.comのRSSフィード(XML)を取得し、記事一覧(タイトル・URL・公開日)を返す。
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
async function fetchFeed() {
  const res = await fetch(FEED_URL);
  if (!res.ok) {
    throw new Error(`note(paperpack_intel)のRSS取得に失敗しました: ${res.status}`);
  }
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items = [];
  $("item").each((_, el) => {
    const $el = $(el);
    const title = $el.find("title").first().text().trim();
    const url = $el.find("link").first().text().trim();
    const pubDateText = $el.find("pubDate").first().text().trim();
    const publishedAt = pubDateText ? new Date(pubDateText).toISOString() : null;
    if (title && url) {
      items.push({ title, url, publishedAt });
    }
  });
  return items;
}

/**
 * note(paperpack_intel)の新着記事を収集する。個人の発信(note)のため、
 * isPrimarySourceはfalse、sourceTypeの判定(官公庁/業界団体/企業/個人・SNS)はClaude側に委ねる。
 */
export async function collectNotePaperpackIntel() {
  const items = await fetchFeed();

  const results = [];
  for (const item of items) {
    // 1件の処理失敗で以降の全件を巻き込んで取りこぼさないよう、1件ごとにtry/catchで囲む。
    try {
      const pageText = await fetchArticleText(item.url);
      const result = await ingestItem({
        title: item.title,
        rawText: pageText ? `${item.title}\n\n${pageText}` : item.title,
        sourceUrl: item.url,
        sourceId: SOURCE_ID,
        sourceName: SOURCE_NAME,
        isPrimarySource: false,
        publishedAt: item.publishedAt
      });
      results.push({ title: item.title, ...result });
    } catch (err) {
      results.push({ title: item.title, skipped: true, reason: `error: ${err.message}` });
    }
  }
  return results;
}
