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

  // Tavilyの`days`パラメータはtopic:"news"専用で、topic:"general"では黙って無視される
  // (公式ドキュメントで確認済み)。そのため実際にはdaysを指定しても期間で絞り込まれておらず、
  // 「新着監視のつもりが何年も前の記事が混ざる」原因になっていた。
  // topic:"general"で期間を絞るには start_date/end_date + filter_by_published_date を使う。
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const toDateString = (d) => d.toISOString().slice(0, 10);

  // topic:"news" は速報ニュース向けで、古紙のような専門業界の話題を拾いにくかったため
  // (実際に試したところ無関係な結果しか返らなかった)、topic:"general" に変更している。
  const response = await client.search(query, {
    topic: "general",
    startDate: toDateString(startDate),
    endDate: toDateString(endDate),
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
