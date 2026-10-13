import * as cheerio from "cheerio";

// 経産省(meti.js)で必要だった対策と同様、UAが無いとWAFに弾かれるサイトがあるため共通で付与する。
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "ja,en;q=0.8"
};

const MAX_CHARS = 6000;

/**
 * ページを取得し、HTML以外(PDF等)や失敗時はnullを返す。
 * @param {string} url
 * @returns {Promise<cheerio.CheerioAPI | null>}
 */
async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null; // PDF等は非対応

    const html = await res.text();
    return cheerio.load(html);
  } catch {
    return null;
  }
}

/**
 * metaタグ・JSON-LD・<time>要素から公開日を探す。Tavily検索結果に公開日が
 * 付いていないケース(一般キーワード監視)のフォールバックとして使う。
 * @param {cheerio.CheerioAPI} $
 * @returns {string | null} ISO文字列
 */
// 未来の日付は「公開日」としてあり得ない(ページ内の別イベント告知等を誤って拾った可能性が高い)
// ため、候補から除外する。多少の時計のずれを考慮して1日分の余裕を持たせる。
function isPlausiblePastDate(d) {
  return !isNaN(d.getTime()) && d.getTime() < Date.now() + 24 * 60 * 60 * 1000;
}

function extractPublishedDate($) {
  const metaCandidates = [
    'meta[property="article:published_time"]',
    'meta[property="og:article:published_time"]',
    'meta[name="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="date"]',
    'meta[itemprop="datePublished"]'
  ];
  for (const selector of metaCandidates) {
    const content = $(selector).attr("content");
    if (content) {
      const d = new Date(content);
      if (isPlausiblePastDate(d)) return d.toISOString();
    }
  }

  // JSON-LDは記事自身の構造化データなので、ページ内の最初の<time>要素より信頼できる
  // (<time>はサイドバーの関連記事・別イベントの告知など、記事と無関係な日付を拾うことがあった。
  //  実例: kankyo-business.jpの記事で、本文の公開日ではなく掲載されていた別イベントの開催日
  //  2026-11-18を誤って採用し、未来日付として保存してしまった)。
  let jsonLdDate = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdDate) return;
    try {
      const data = JSON.parse($(el).contents().text());
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item?.datePublished) {
          const d = new Date(item.datePublished);
          if (isPlausiblePastDate(d)) {
            jsonLdDate = d.toISOString();
            break;
          }
        }
      }
    } catch {
      // JSON-LDのパース失敗は無視
    }
  });
  if (jsonLdDate) return jsonLdDate;

  const timeDatetime = $("time[datetime]").first().attr("datetime");
  if (timeDatetime) {
    const d = new Date(timeDatetime);
    if (isPlausiblePastDate(d)) return d.toISOString();
  }

  return null;
}

/**
 * リンク先ページの本文らしきテキストを取得する。タイトルだけでは「会が開催された」
 * といった事実だけしか分からず要約として不十分なため、Claudeに読ませる元ネタを増やす目的で使う。
 * PDFや取得失敗時はnullを返し、呼び出し側はタイトルのみへのフォールバックとする。
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function fetchArticleText(url) {
  const $ = await fetchHtml(url);
  if (!$) return null;

  $("script, style, nav, header, footer, noscript").remove();
  const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return text ? text.slice(0, MAX_CHARS) : null;
}

/**
 * Tavily検索結果に公開日が付いていない場合のフォールバックとして、リンク先ページ自体から
 * 公開日を取得する。PDFや取得失敗、メタ情報が無いページではnullを返す。
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function fetchPublishedDate(url) {
  const $ = await fetchHtml(url);
  if (!$) return null;
  return extractPublishedDate($);
}
