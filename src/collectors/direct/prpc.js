import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { fetchArticleText } from "../../lib/articleFetcher.js";

export const SOURCE_ID = "prpc";
export const SOURCE_NAME = "古紙再生促進センター";
const BASE_URL = "http://www.prpc.or.jp";

/**
 * 「YYYY年MM月DD日」形式の日付文字列をISO文字列に変換する。
 * @param {string} text
 * @returns {string | null}
 */
function parseJapaneseDate(text) {
  const m = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
}

/**
 * 古紙再生促進センターの「お知らせ」一覧(年別カテゴリページ)を取得し、
 * 日付+タイトル+リンクの一覧に変換する。
 * ページ構造: <tr><th>YYYY年MM月DD日</th>...</tr><tr><td class="ttl"><a href="...">タイトル</a></td></tr>
 * @param {number} year
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
export async function fetchNewsList(year) {
  const listUrl = `${BASE_URL}/category/news/${year}/`;
  const res = await fetch(listUrl);
  if (!res.ok) {
    throw new Error(`古紙再生促進センターのお知らせ一覧取得に失敗しました: ${res.status} ${listUrl}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  let pendingDate = null;

  $("tr").each((_, tr) => {
    const $tr = $(tr);
    const dateText = $tr.find("th").first().text().trim();
    if (dateText) {
      pendingDate = parseJapaneseDate(dateText);
      return;
    }
    const $link = $tr.find("td.ttl a").first();
    if ($link.length > 0) {
      const title = $link.text().trim();
      const href = $link.attr("href");
      if (title && href) {
        const absoluteUrl = new URL(href, BASE_URL).toString();
        items.push({ title, url: absoluteUrl, publishedAt: pendingDate });
      }
      pendingDate = null;
    }
  });

  return items;
}

/**
 * 古紙再生促進センターの最新のお知らせを収集し、取り込みパイプラインに渡す。
 * @param {{ year?: number }} [options]
 */
export async function collectPrpc(options = {}) {
  const year = options.year ?? new Date().getFullYear();
  const newsItems = await fetchNewsList(year);

  const results = [];
  for (const item of newsItems) {
    // リンク先(外部サイトの場合も含む)の本文を取得して要約精度を上げる。取得できない場合はタイトルのみ。
    const pageText = await fetchArticleText(item.url);
    const result = await ingestItem({
      title: item.title,
      rawText: pageText ? `${item.title}\n\n${pageText}` : item.title,
      sourceUrl: item.url,
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      isPrimarySource: true,
      publishedAt: item.publishedAt
    });
    results.push({ title: item.title, ...result });
  }
  return results;
}
