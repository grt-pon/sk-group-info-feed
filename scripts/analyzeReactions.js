import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// 週次で「使える/不要」の反応がついた記事を集計し、傾向をClaudeに分析させて
// analysis_reportsテーブルに保存する。自動でキーワードやプロンプトを書き換えることはせず、
// ここで出た提案を人が見て、必要なら会話(Claude Code)で修正を指示する運用。
const MODEL = "claude-sonnet-5";

function parseJsonResponse(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(stripped);
}

function distinctCount(reactions, judgement) {
  return new Set((reactions || []).filter((r) => r.judgement === judgement).map((r) => r.userId)).size;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: items, error } = await supabase
    .from("items")
    .select("title, summary, source_name, categories, reactions");
  if (error) throw error;

  const withReactions = items
    .map((item) => ({
      title: item.title,
      summary: item.summary,
      sourceName: item.source_name,
      categories: item.categories,
      want: distinctCount(item.reactions, "want"),
      notWant: distinctCount(item.reactions, "not_want")
    }))
    .filter((item) => item.want > 0 || item.notWant > 0)
    .sort((a, b) => (b.want + b.notWant) - (a.want + a.notWant));

  if (withReactions.length === 0) {
    console.log("反応がついた記事がまだ無いため、今回はレポートを作成しません。");
    return;
  }

  const listText = withReactions
    .map((i) => `- [使える${i.want}件/不要${i.notWant}件] (${i.sourceName}/${(i.categories || []).join("・")}) ${i.title}\n  要約: ${i.summary}`)
    .join("\n");

  const prompt = `あなたは社内情報ポータルの情報収集ルールを改善するアシスタントです。
以下は、社員が「使える」「不要」の反応をつけた記事の一覧です(タイトル・要約・情報源・カテゴリ・件数)。

${listText}

これを踏まえて、次の観点で日本語の分析レポートを書いてください(見出し付きのテキストで、箇条書き中心・簡潔に):
1. 「不要」が多い記事群に共通する特徴(情報源、内容の傾向、ジャンルなど)
2. 「使える」が多い記事群に共通する特徴
3. 上記を踏まえた具体的な改善案(例: 特定のキーワードを除外・追加する、特定の情報源の扱いを見直す、
   ニュース価値判定の基準に追加すべきルール、など)。既存の仕組み(KEYWORDS配列・isNewsworthy判定・
   情報源ごとのコレクタ)のどこを直すと良さそうかも分かる範囲で触れる。
反応がまだ少ない場合は、その旨も正直に書いてください(無理に結論を出さない)。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"report": "ここにレポート本文"}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }]
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const { report } = parseJsonResponse(text);

  const { error: insertError } = await supabase.from("analysis_reports").insert({ content: report });
  if (insertError) throw insertError;

  console.log("レポートを保存しました。");
  console.log(report);
}

main();
