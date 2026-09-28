import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";

export const SOURCE_ID = "kantoshoso";
export const SOURCE_NAME = "関東製紙原料直納商工組合";
const PAGE_URL = "http://www.kantoushoso.com/market/transition.html";

/**
 * 関東製紙原料直納商工組合の「古紙輸出価格動向表」ページから、
 * 掲載されているPDF(価格推移グラフ)へのリンクを取得する。
 * PDFファイル名に年月が入っている(例: price2026apr.pdf)ため、ファイルが変われば新しい月のデータとみなせる。
 * @returns {Promise<Array<{ title: string, url: string }>>}
 */
export async function fetchPriceLinks() {
  const res = await fetch(PAGE_URL);
  if (!res.ok) {
    throw new Error(`関東製紙原料直納商工組合のページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $('a[href$=".pdf"]').each((_, a) => {
    const $a = $(a);
    const title = $a.text().trim();
    const href = $a.attr("href");
    if (title && href) {
      items.push({ title, url: new URL(href, PAGE_URL).toString() });
    }
  });
  return items;
}

/**
 * 古紙輸出価格の最新資料を収集し、取り込みパイプラインに渡す。
 * PDFファイルが月ごとに新しいURLになるため、URLの重複チェックだけで「新しい月の資料か」を判定できる。
 */
export async function collectKantoshoso() {
  const priceLinks = await fetchPriceLinks();

  const results = [];
  for (const item of priceLinks) {
    const result = await ingestItem({
      title: `古紙輸出価格動向表: ${item.title}`,
      // PDFの中身までは読み取っておらず、リンクとタイトルのみを渡している(要約精度は限定的)。
      rawText: `関東製紙原料直納商工組合が公表した古紙輸出価格の資料「${item.title}」が更新されました。`,
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
