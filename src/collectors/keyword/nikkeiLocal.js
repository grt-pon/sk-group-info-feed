import * as cheerio from "cheerio";
import { tracePrimarySource } from "../../lib/primarySourceTracer.js";
import { ingestItem } from "../../pipeline/ingest.js";
import { isRelevantTopic } from "../../config/categoryRules.js";

const SOURCE_ID = "nikkei-local-tohoku";
const SOURCE_NAME = "日本経済新聞(地域面・東北)";
const PAGE_URL = "https://www.nikkei.com/local/tohoku/";
const BASE_URL = "https://www.nikkei.com";

/**
 * 日経の地域面(東北)の見出し一覧を取得する。記事本文は有料会員限定だが、
 * 見出し自体は会員登録なしで見える(通常のfetchで取得できるサーバーサイドレンダリング)。
 * @returns {Promise<Array<{ title: string, url: string }>>}
 */
async function fetchHeadlines() {
  const res = await fetch(PAGE_URL);
  if (!res.ok) {
    throw new Error(`日経地域面(東北)のページ取得に失敗しました: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const items = [];
  $('a[href^="/article/"]').each((_, a) => {
    const $a = $(a);
    const title = $a.text().trim();
    const href = $a.attr("href");
    if (!title || !href) return;
    const url = new URL(href, BASE_URL).toString();
    if (seen.has(url)) return; // 同じ記事へのリンクが画像用・テキスト用で重複しているため
    seen.add(url);
    items.push({ title, url });
  });
  return items;
}

/**
 * 日経地域面(東北)の見出しのうち、古紙・廃棄物に関連しそうなものだけ、
 * 見出しを手がかりに一次情報(プレスリリース等)を探して取り込みパイプラインに渡す。
 * 有料記事の本文はそのまま使わず、辿り着いた一次情報を実際の情報源として扱う。
 * @param {{ maxItems?: number }} [options]
 */
export async function collectNikkeiLocalTohoku(options = {}) {
  const { maxItems = 5 } = options;
  const headlines = await fetchHeadlines();
  const relevant = headlines.filter((h) => isRelevantTopic(h.title)).slice(0, maxItems);

  const results = [];
  for (const headline of relevant) {
    // プレスリリースが先に出て、日経の報道が後追いすることがあるため検索期間は長めに取る
    // (実例:2025年3月の発表が2026年に記事化されたケースを確認済み)。
    const primary = await tracePrimarySource({
      headlineTitle: headline.title,
      searchDays: 365
    });
    if (!primary) {
      results.push({ title: headline.title, skipped: true, reason: "no_primary_source_found" });
      continue;
    }

    const result = await ingestItem({
      title: primary.title,
      rawText: primary.content,
      sourceUrl: primary.url,
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      isPrimarySource: true, // 日経ではなく、辿り着いた一次情報そのものとして扱う
      publishedAt: null
    });
    results.push({ title: primary.title, ...result });
  }
  return results;
}
