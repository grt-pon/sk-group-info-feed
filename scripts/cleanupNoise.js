import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// summarizeAndClassifyの「isNewsworthy」判定が導入される前に保存された既存記事を、
// タイトル・要約だけを使って同じ基準で再判定し、ニュース価値がないと判定されたものを削除する一回限りのスクリプト。
// ユーザーの明示的な許可(2026-10-06「削除してOK」)を得て実行する。
const MODEL = "claude-sonnet-5";

async function isNewsworthy(anthropic, title, summary) {
  const prompt = `以下は古紙・廃棄物業界の社内情報ポータルに保存されている記事のタイトルと要約です。
ニュース価値があるかどうかを判定してください。
以下に該当する場合はfalseにする:
- 「○○統計を更新しました」「需給速報を更新」のように、定例の統計・資料ページが更新されたという事実だけで、
  具体的な数値・変化・トレンドなど読者が持ち帰れる情報がない場合
- 単なる会議・資料公開の告知で、何が話し合われた・決まったのかが分からない場合
具体的な数値や、何が起きた/決まった/変化したかが分かる内容であればtrueにする。

出力は必ず次のJSON形式のみで返してください:
{"isNewsworthy": true}

---
タイトル: ${title}
要約: ${summary}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }]
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const parsed = JSON.parse(stripped);
    return parsed.isNewsworthy !== false;
  } catch {
    console.error(`    JSON解析失敗、生の出力: ${text}`);
    throw new Error("isNewsworthy判定のJSON解析に失敗しました");
  }
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: items, error } = await supabase.from("items").select("id, title, summary");
  if (error) throw error;

  console.log(`判定対象: ${items.length}件`);
  const toDelete = [];
  for (const item of items) {
    let ok;
    try {
      ok = await isNewsworthy(anthropic, item.title, item.summary);
    } catch (err) {
      console.error(`  [skip-on-error] ${item.title}: ${err.message}`);
      continue; // 判定に失敗した記事は安全側に倒して削除しない
    }
    console.log(`  [${ok ? "news" : "noise"}] ${item.title}`);
    if (!ok) toDelete.push(item.id);
  }

  console.log(`\n削除対象: ${toDelete.length}件`);
  if (toDelete.length === 0) return;

  const { error: deleteError } = await supabase.from("items").delete().in("id", toDelete);
  if (deleteError) throw deleteError;
  console.log("削除完了");
}

main();
