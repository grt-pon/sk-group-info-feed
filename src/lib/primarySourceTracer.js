import { searchRecent } from "./tavilyClient.js";
import { isMatchingPrimarySource } from "./claudeClient.js";

/**
 * 見出し・発信元情報を手がかりに、対応する一次情報(官公庁発表・プレスリリース等)を検索して辿る。
 * 循環経済新聞・日経新聞地域面など、本文が有料/非公開で直接使えない情報源から
 * 一次情報へ「格上げ」するための共通ロジック。
 *
 * ドメイン(.go.jp / prtimes.jp 等)だけで判定すると、たまたま同じ分野の無関係な文書を
 * 誤って一次情報扱いしてしまうことがあったため、候補ごとにClaudeで内容が実際に
 * 一致するかを検証し、最初に一致したものだけを採用する。一致するものがなければ null を返す
 * (辿れない場合は取り上げない、という方針)。
 *
 * @param {{ headlineTitle: string, headlineHint?: string, searchDays?: number }} input
 *   headlineHint: 発信元組織名やサブタイトルなど、検索クエリの精度を上げるための追加情報
 *   searchDays: 検索対象期間(日数)。プレスリリースが先に出て報道が後追いすることがあるため、
 *               デフォルトはやや長め(90日)にしている。
 * @returns {Promise<{ title: string, url: string, content: string } | null>}
 */
export async function tracePrimarySource({ headlineTitle, headlineHint = "", searchDays = 90 }) {
  const query = [headlineHint, headlineTitle].filter(Boolean).join(" ");
  const found = await searchRecent(query, { days: searchDays, maxResults: 5 });

  const candidates = found.filter(
    (r) => r.url.includes(".go.jp") || r.url.includes("prtimes.jp") || r.url.includes("release")
  );

  for (const candidate of candidates) {
    const matches = await isMatchingPrimarySource({
      headlineTitle,
      headlineOrg: headlineHint,
      candidateTitle: candidate.title,
      candidateContent: candidate.content
    });
    if (matches) {
      return { title: candidate.title, url: candidate.url, content: candidate.content };
    }
  }
  return null;
}
