import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { isRelevantTopic } from "../../config/categoryRules.js";

export const SOURCE_ID = "sendai-city";
export const SOURCE_NAME = "仙台市";
const BASE_URL = "https://www.city.sendai.jp";

/**
 * 今日時点の和暦年度(4月始まり)と月を "r8", "09" のような形式で返す。
 * 仙台市の記者発表資料ページのURL(/shise/koho/kisha/r{年度}/{月}/)がこの形式のため。
 * @returns {{ fiscalYear: string, month: string }}
 */
function getCurrentFiscalYearMonth() {
  const now = new Date();
  const calendarYear = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const fiscalCalendarYear = month >= 4 ? calendarYear : calendarYear - 1;
  const reiwaYear = fiscalCalendarYear - 2018;
  return { fiscalYear: `r${reiwaYear}`, month: String(month).padStart(2, "0") };
}

/**
 * 仙台市の「記者発表資料」当月分一覧を取得する(全庁横断、部署の絞り込みなし)。
 * ページ構造: <div id="tmp_contents2"><ul><li><a href="...">タイトル</a></li>...</ul></div>
 * 個別の発表日はページ内に一貫した形で出ておらず(当月分のページであること自体を日付の目安とする)。
 * @returns {Promise<Array<{ title: string, url: string }>>}
 */
async function fetchPressReleaseList() {
  const { fiscalYear, month } = getCurrentFiscalYearMonth();
  const pageUrl = `${BASE_URL}/shise/koho/kisha/${fiscalYear}/${month}/index.html`;

  const res = await fetch(pageUrl);
  if (!res.ok) {
    throw new Error(`仙台市の記者発表資料ページ取得に失敗しました: ${res.status} ${pageUrl}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $("#tmp_contents2 li a").each((_, a) => {
    const $a = $(a);
    const title = $a.text().trim();
    const href = $a.attr("href");
    if (title && href) {
      items.push({ title, url: new URL(href, BASE_URL).toString() });
    }
  });
  return items;
}

/**
 * 仙台市の記者発表資料を収集する。市役所全体のお知らせが混ざるため、
 * 古紙・廃棄物に関連しそうなキーワードを含むものだけを取り込みパイプラインに渡す。
 */
export async function collectSendai() {
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
      publishedAt: null
    });
    results.push({ title: item.title, ...result });
  }
  return results;
}
