import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// 週次で「参考になった」反応・閲覧回数を集計し、傾向をClaudeに分析させて
// analysis_reports(report_type: weekly_analysis)テーブルに保存する。自動でキーワードや
// プロンプトを書き換えることはせず、ここで出た提案を人が見て、必要なら会話(Claude Code)で修正を指示する運用。
//
// 以前は「使える/不要」の2択だったが、必要な情報は人によって違い「不要」を押す基準が
// 曖昧という問題があったため、「参考になった」1つのボタン+閲覧回数の組み合わせに変更した。
// 「閲覧回数は多いのに参考になった率が低いカテゴリ・情報源」を改善候補として抽出する方式にする
// (閲覧は押す手間がなく自動で貯まるため、反応ボタンだけよりサンプル数が増える見込み)。
// 旧データの"want"判定も「参考になった」として引き続き集計に含める(過去データを無駄にしないため)。
const MODEL = "claude-sonnet-5";

function parseJsonResponse(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(stripped);
}

function usefulCount(reactions) {
  return new Set(
    (reactions || []).filter((r) => r.judgement === "useful" || r.judgement === "want").map((r) => r.userId)
  ).size;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: items, error } = await supabase
    .from("items")
    .select("title, summary, source_name, categories, reactions, view_count");
  if (error) throw error;

  const viewed = items
    .map((item) => ({
      title: item.title,
      summary: item.summary,
      sourceName: item.source_name,
      categories: item.categories,
      views: item.view_count ?? 0,
      useful: usefulCount(item.reactions)
    }))
    .filter((item) => item.views > 0)
    .sort((a, b) => b.views - a.views);

  if (viewed.length === 0) {
    console.log("閲覧された記事がまだ無いため、今回はレポートを作成しません。");
    return;
  }

  const listText = viewed
    .map((i) => `- [閲覧${i.views}回/参考になった${i.useful}件] (${i.sourceName}/${(i.categories || []).join("・")}) ${i.title}\n  要約: ${i.summary}`)
    .join("\n");

  const prompt = `あなたは社内情報ポータルの情報収集ルールを改善するアシスタントです。
以下は、閲覧された記事の一覧です(タイトル・要約・情報源・カテゴリ・閲覧回数・「参考になった」件数)。

${listText}

これを踏まえて、次の観点で日本語の分析レポートを書いてください(見出し付きのテキストで、箇条書き中心・簡潔に):
1. 閲覧回数が多いのに「参考になった」の件数・割合が低い記事群に共通する特徴(情報源、内容の傾向、ジャンルなど)。
   これは「開いてみたが期待と違った・刺さらなかった」可能性がある記事群として扱う
2. 閲覧回数・「参考になった」の両方が高い記事群に共通する特徴
3. 上記を踏まえた具体的な改善案(例: 特定のキーワードを除外・追加する、特定の情報源の扱いを見直す、
   ニュース価値判定の基準に追加すべきルール、など)。既存の仕組み(KEYWORDS配列・isNewsworthy判定・
   情報源ごとのコレクタ)のどこを直すと良さそうかも分かる範囲で触れる。
データがまだ少ない場合は、その旨も正直に書いてください(無理に結論を出さない)。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"report": "ここにレポート本文"}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }]
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const { report } = parseJsonResponse(text);

  const { error: insertError } = await supabase
    .from("analysis_reports")
    .insert({ content: report, report_type: "weekly_analysis" });
  if (insertError) throw insertError;

  console.log("レポートを保存しました。");
  console.log(report);
}

main();
