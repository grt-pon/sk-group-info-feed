import * as cheerio from "cheerio";
import { ingestItem } from "../../pipeline/ingest.js";
import { fetchArticleText } from "../../lib/articleFetcher.js";

export const SOURCE_ID = "env-recycle";
export const SOURCE_NAME = "環境省(資源循環関連報道発表)";
const PAGE_URL = "https://www.env.go.jp/press/recycle/index.html";
const BASE_URL = "https://www.env.go.jp";

/**
 * 「YYYY年MM月DD日発表」形式の日付をISO文字列に変換する。
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
 * 環境省の「資源循環」カテゴリに絞られた報道発表一覧を取得する。
 * ページ構造: <details class="p-press-release-list__block"><summary>...日付見出し...</summary>
 *   <ul class="p-news-link"><li class="c-news-link__item"><a href="...">タイトル</a></li>...</ul></details>
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string | null }>>}
 */
export async function fetchPressReleaseList() {
  const res = await fetch(PAGE_URL);
  if (!res.ok) {
    throw new Error(`環境省(資源循環)のページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = [];
  $(".p-press-release-list__block").each((_, block) => {
    const $block = $(block);
    const dateText = $block.find(".p-press-release-list__heading").first().text().trim();
    const publishedAt = parseJapaneseDate(dateText);

    $block.find(".c-news-link__item").each((_, li) => {
      const $link = $(li).find("a").first();
      const title = $link.text().trim();
      const href = $link.attr("href");
      if (title && href) {
        items.push({ title, url: new URL(href, BASE_URL).toString(), publishedAt });
      }
    });
  });
  return items;
}

/**
 * 環境省(資源循環関連)の最新の報道発表を収集し、取り込みパイプラインに渡す。
 */
export async function collectEnv() {
  const items = await fetchPressReleaseList();

  const results = [];
  for (const item of items) {
    // リンク先(発表資料ページ)の本文を取得し、タイトルだけでは分からない開催内容・配布資料の
    // 中身までClaudeが要約できるようにする。取得できない場合(PDF等)はタイトルのみにフォールバックする。
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
