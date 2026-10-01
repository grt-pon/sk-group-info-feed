import * as cheerio from "cheerio";

// 経産省(meti.js)で必要だった対策と同様、UAが無いとWAFに弾かれるサイトがあるため共通で付与する。
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  "Accept-Language": "ja,en;q=0.8"
};

const MAX_CHARS = 6000;

/**
 * リンク先ページの本文らしきテキストを取得する。タイトルだけでは「会が開催された」
 * といった事実だけしか分からず要約として不十分なため、Claudeに読ませる元ネタを増やす目的で使う。
 * PDFや取得失敗時はnullを返し、呼び出し側はタイトルのみへのフォールバックとする。
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export async function fetchArticleText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null; // PDF等は非対応

    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, header, footer, noscript").remove();

    const text = $("body").text().replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
    if (!text) return null;

    return text.slice(0, MAX_CHARS);
  } catch {
    return null;
  }
}
