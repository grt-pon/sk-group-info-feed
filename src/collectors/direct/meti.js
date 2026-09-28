import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";

export const SOURCE_ID = "meti";
export const SOURCE_NAME = "経済産業省(資源循環経済小委員会)";
const PAGE_URL = "https://www.meti.go.jp/shingikai/sankoshin/sangyo_gijutsu/resource_circulation/index.html";

// 経産省サイトはUser-Agent未設定のアクセスを403で拒否するため、ブラウザに近いUser-Agentを付与する。
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
};

/**
 * 「YYYY年M月D日」形式の日付をISO文字列に変換する。
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
 * 産業構造審議会「資源循環経済小委員会」の開催回一覧を取得する。
 * ※このページの前身「廃棄物・リサイクル小委員会」(2020年で開催終了)から改組されたもの。
 * 経産省の他の統合ページ(古紙・パルプの案内ページ等)は更新されない静的な参考ページだったため、
 * 実際に新着を監視できるのはこちらの審議会ページと判断した。
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
export async function fetchMeetingList() {
  const res = await fetch(PAGE_URL, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`経産省(資源循環経済小委員会)のページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $("a").each((_, a) => {
    const $a = $(a);
    const text = $a.text().trim();
    const href = $a.attr("href");
    if (!href || !text) return;
    const publishedAt = parseJapaneseDate(text);
    if (!publishedAt) return; // 日付を含むリンクだけを「開催回」として扱う
    items.push({ title: text, url: new URL(href, PAGE_URL).toString(), publishedAt });
  });
  return items;
}

/**
 * 資源循環経済小委員会の開催回情報を収集し、取り込みパイプラインに渡す。
 */
export async function collectMeti() {
  const meetings = await fetchMeetingList();

  const results = [];
  for (const item of meetings) {
    const result = await ingestItem({
      title: `産業構造審議会 資源循環経済小委員会 ${item.title}`,
      // 本文(議事録・配布資料PDF)までは取得しておらず、開催回のタイトルのみを渡している。
      rawText: `経済産業省の産業構造審議会 資源循環経済小委員会が「${item.title}」を開催した(開催案内・配布資料のページが公開された)。`,
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
