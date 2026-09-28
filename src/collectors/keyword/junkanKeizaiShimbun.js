import { tracePrimarySource } from "../../lib/primarySourceTracer.js";
import { ingestItem } from "../../pipeline/ingest.js";

const SOURCE_ID = "junkan-keizai-shimbun";
const SOURCE_NAME = "循環経済新聞";
const CURRENT_YEAR = new Date().getFullYear();
const DIGEST_JSON_URL = `https://www.nippo.co.jp/json/news-paper/jk${CURRENT_YEAR}.json`;

/**
 * 循環経済新聞トップページの「▼最新号▼」ダイジェストが実際に読みに行っているJSONを取得する。
 * (トップページ自体はJavaScriptのカスタム要素<np-list>がこのJSONを裏で取得して表示しているだけで、
 *  ヘッドレスブラウザは不要だった。Playwrightの導入を試したが、この情報源には結局使わなかった。)
 * @returns {Promise<Array<{ id: string, name: string, date: string, contents: Array<{ title: string, subtitles: string[], organization: string }> }>>}
 */
async function fetchDigestIssues() {
  const res = await fetch(DIGEST_JSON_URL);
  if (!res.ok) {
    throw new Error(`循環経済新聞のダイジェストJSON取得に失敗しました: ${res.status}`);
  }
  return res.json();
}

/**
 * 循環経済新聞の最新号ダイジェストを手がかりに一次情報を辿り、見つかったものだけを取り込みパイプラインに渡す。
 * 辿れる一次情報が見つからない見出しは取り上げない(方針として決定済み)。
 * @param {{ maxItems?: number }} [options] 最新号のうち何件を対象にするか(デフォルト5件、コスト抑制のため)
 */
export async function collectJunkanKeizaiShimbun(options = {}) {
  const { maxItems = 5 } = options;
  const issues = await fetchDigestIssues();
  const latestIssue = issues[0]; // 配列は新しい号が先頭
  if (!latestIssue) {
    return [];
  }

  const headlines = latestIssue.contents.slice(0, maxItems);

  const results = [];
  for (const headline of headlines) {
    const headlineHint = [headline.organization, ...(headline.subtitles ?? [])].filter(Boolean).join(" ");
    const primary = await tracePrimarySource({
      headlineTitle: headline.title,
      headlineHint,
      searchDays: 21 // 週刊誌のダイジェストなので、報道発表からの遅れは比較的短いと想定
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
      isPrimarySource: true, // 循環経済新聞ではなく、辿り着いた一次情報そのものとして扱う
      publishedAt: latestIssue.date ?? null
    });
    results.push({ title: primary.title, ...result });
  }
  return results;
}
