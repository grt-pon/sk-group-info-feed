import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { isRelevantTopic } from "../../config/categoryRules.js";

export const SOURCE_ID = "miyagi-pref";
export const SOURCE_NAME = "宮城県";
const PAGE_URL = "https://www.pref.miyagi.jp/release/index.html";
const BASE_URL = "https://www.pref.miyagi.jp";

/**
 * "M月D日"形式の日付(年なし)をISO文字列に変換する。年は現在年と仮定し、
 * 月が現在より大幅に先の場合は前年とみなす(年末年始の簡易対応)。
 * @param {string} text
 * @returns {string | null}
 */
function parseMonthDay(text) {
  const m = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const now = new Date();
  const [, mo, d] = m;
  let year = now.getFullYear();
  if (Number(mo) - (now.getMonth() + 1) > 6) {
    year -= 1;
  }
  return new Date(Date.UTC(year, Number(mo) - 1, Number(d))).toISOString();
}

/**
 * 宮城県の「報道発表資料」一覧(全庁横断、部署の絞り込みなし)を取得する。
 * ページ構造: <h2>最新のプレスリリース一覧</h2><ul><li><p>M月D日<a href="...">タイトル</a></p></li>...</ul>
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
async function fetchPressReleaseList() {
  const res = await fetch(PAGE_URL);
  if (!res.ok) {
    throw new Error(`宮城県の報道発表資料ページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const heading = $("#tmp_contents h2")
    .filter((_, el) => $(el).text().includes("最新のプレスリリース一覧"))
    .first();
  const $ul = heading.nextAll("ul").first();

  const items = [];
  $ul.find("li").each((_, li) => {
    const $p = $(li).find("p").first();
    const $a = $p.find("a").first();
    const title = $a.text().trim();
    const href = $a.attr("href");
    const publishedAt = parseMonthDay($p.text());
    if (title && href) {
      items.push({ title, url: new URL(href, BASE_URL).toString(), publishedAt });
    }
  });
  return items;
}

/**
 * 宮城県の報道発表資料を収集する。県庁全体のお知らせが混ざるため、
 * 古紙・廃棄物に関連しそうなキーワードを含むものだけを取り込みパイプラインに渡す。
 */
export async function collectMiyagi() {
  const items = await fetchPressReleaseList();
  const relevant = items.filter((item) => isRelevantTopic(item.title));

  const results = [];
  for (const item of relevant) {
    const result = await ingestItem({
      title: item.title,
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
