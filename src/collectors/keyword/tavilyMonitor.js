import { searchRecent } from "../../lib/tavilyClient.js";
import { ingestItem } from "../../pipeline/ingest.js";
import { isLikelyDisposalGuide } from "../../config/categoryRules.js";
import { fetchPublishedDate } from "../../lib/articleFetcher.js";

const SOURCE_ID = "general-keyword-watch";
const SOURCE_NAME = "一般キーワード監視(Tavily)";

// 拾いたいキーワード。要る/要らないの傾向を見ながらここを調整していく想定。
// 「動向」「価格」「統計」等を付けて、自治体の「ごみの出し方」的な定型ページより
// ニュース・市況寄りの内容が上位に出るよう調整した(実際に試したところ効果があった)。
// 古紙に加えて、リサイクル業界全体(家具・家電・金属等)のニュースも拾う方針に拡張。
// ノイズは isLikelyDisposalGuide(定型ごみ出しページ除外)と、ingest.js側のisNewsworthy判定
// (具体的な数値・動きのないお知らせを除外)で抑える想定。
const KEYWORDS = [
  "古紙 相場 動向",
  "古紙 リサイクル 業界 動向",
  "段ボール古紙 価格",
  "古紙 輸出 統計",
  "家具 リサイクル 企業",
  "家電 リサイクル 動向",
  "金属スクラップ 相場 動向",
  "循環経済 企業 取り組み"
];

// 通常運用時の検索期間(日数)。「ここ1〜2週間の新着だけ」という方針のデフォルト。
// 初回のみ過去1年分をまとめて取り込みたい場合は環境変数 KEYWORD_WATCH_DAYS で上書きする
// (例: KEYWORD_WATCH_DAYS=365 npm run collect)。重複はURLベースで自動的にスキップされるため、
// 広い期間で実行しても既存記事が重複保存されることはない。
const DEFAULT_WATCH_DAYS = 14;

/**
 * 登録済みキーワードでTavily検索し、新着記事を取り込みパイプラインに渡す。
 * @returns {Promise<Array<{ title: string, skipped: boolean, reason?: string, itemId?: string }>>}
 */
export async function collectByKeywordWatch() {
  const days = Number(process.env.KEYWORD_WATCH_DAYS) || DEFAULT_WATCH_DAYS;
  const maxResults = days > 30 ? 20 : 8; // 長期間バックフィル時は取りこぼしを減らすため上限まで取得する

  const results = [];

  for (const keyword of KEYWORDS) {
    const found = await searchRecent(keyword, { days, maxResults });

    for (const article of found) {
      if (isLikelyDisposalGuide(article.title)) {
        results.push({ title: article.title, skipped: true, reason: "disposal_guide_noise" });
        continue;
      }
      // Tavilyが公開日を返さないことが多いため、リンク先ページ自体のmeta情報からも探す。
      const publishedAt = article.publishedDate || (await fetchPublishedDate(article.url));
      const result = await ingestItem({
        title: article.title,
        rawText: article.content,
        sourceUrl: article.url,
        sourceId: SOURCE_ID,
        sourceName: SOURCE_NAME,
        isPrimarySource: false,
        publishedAt
      });
      results.push({ title: article.title, ...result });
    }
  }

  return results;
}
