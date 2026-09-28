import "dotenv/config";
import { tavily } from "@tavily/core";

// 利用が保留・対象外の情報源、および「自社の文章を情報源として使わない」方針の情報源(循環経済新聞)は、
// Tavilyの検索結果からも除外する。
// - kosijnl.co.jp: 古紙ジャーナル。規約確認待ちで保留中のため、検索経由で内容を取り込まないようにする
// - nippo.co.jp: 循環経済新聞。ダイジェストを手がかりに一次情報を探す方針のため、
//   自社サイト自体が検索結果に混ざって「一次情報」として誤って採用されるのを防ぐ
const EXCLUDED_DOMAINS = ["kosijnl.co.jp", "nippo.co.jp"];

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error("TAVILY_API_KEY が設定されていません。.env を設定してください。");
    }
    client = tavily({ apiKey });
  }
  return client;
}

/**
 * キーワードで新着記事を検索する(Google Alert的な監視)。
 * @param {string} query 検索キーワード
 * @param {{ days?: number, maxResults?: number }} [options]
 * @returns {Promise<Array<{ title: string, url: string, content: string, publishedDate?: string }>>}
 */
export async function searchRecent(query, options = {}) {
  const { days = 30, maxResults = 10 } = options;
  const client = getClient();

  // topic:"news" は速報ニュース向けで、古紙のような専門業界の話題を拾いにくかったため
  // (実際に試したところ無関係な結果しか返らなかった)、topic:"general" に変更している。
  const response = await client.search(query, {
    topic: "general",
    days,
    maxResults,
    searchDepth: "basic",
    excludeDomains: EXCLUDED_DOMAINS
  });

  return (response.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    publishedDate: r.publishedDate ?? null
  }));
}
