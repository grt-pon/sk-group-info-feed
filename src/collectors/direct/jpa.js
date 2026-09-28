import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";

export const SOURCE_ID = "jpa";
export const SOURCE_NAME = "日本製紙連合会";
const INDEX_URL = "https://www.jpa.gr.jp/index.php";
const BASE_URL = "https://www.jpa.gr.jp";

/**
 * "26.07.15" のような2桁年形式の日付をISO文字列に変換する(20XX年と仮定)。
 * @param {string} text
 * @returns {string | null}
 */
function parseShortDate(text) {
  const m = text.match(/(\d{2})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const [, yy, mo, d] = m;
  return new Date(Date.UTC(2000 + Number(yy), Number(mo) - 1, Number(d))).toISOString();
}

/**
 * 日本製紙連合会トップページのお知らせ一覧(dt=日付, dd=リンク の並び)を取得する。
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
export async function fetchNewsList() {
  const res = await fetch(INDEX_URL);
  if (!res.ok) {
    throw new Error(`日本製紙連合会のトップページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $("dt").each((_, dt) => {
    const dateText = $(dt).text().trim();
    const publishedAt = parseShortDate(dateText);
    const $dd = $(dt).next("dd");
    const $link = $dd.find("a").first();
    const title = $link.text().trim();
    const href = $link.attr("href");
    if (title && href) {
      items.push({ title, url: new URL(href, BASE_URL).toString(), publishedAt });
    }
  });

  return items;
}

/**
 * 日本製紙連合会の最新のお知らせを収集し、取り込みパイプラインに渡す。
 */
export async function collectJpa() {
  const newsItems = await fetchNewsList();

  const results = [];
  for (const item of newsItems) {
    const result = await ingestItem({
      title: item.title,
      // 本文はここでは取得しておらず、タイトルを本文代わりに渡している(prpc.jsと同様の暫定対応)。
      rawText: item.title,
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
