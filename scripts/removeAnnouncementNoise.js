import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// 新しく追加した2つのニュース価値ルール(シンポジウム・フォーラムの開催告知だけ／一企業の
// 軽微な活動報告)を、既存の保存済み記事(タイトル・要約)に遡って適用し、該当するものを削除する。
const MODEL = "claude-sonnet-5";

function parseJsonResponse(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(stripped);
}

async function shouldRemove(anthropic, title, summary) {
  const prompt = `以下は社内情報ポータルに保存されている記事のタイトルと要約です。
次のどちらかに該当する場合は削除対象(remove: true)と判定してください。
1. シンポジウム・フォーラム・勉強会等を「開催します」「開催しました」という告知・報告だけで、
   そこで何が発表された・話し合われた・決まったのかという中身がない場合
2. 一企業が「寄付した」「イベントに参加した」「出展した」程度の、自社の軽微な活動報告
   (その企業の自社サイトのお知らせ欄に載る程度の内容)。
   ただし、その企業自身が主催者となり複数の企業・自治体等を巻き込んで行われた規模のイベントで、
   かつ一般のニュースとして報じられている内容(具体的な数値や影響範囲が書かれているもの)は
   該当しない(remove: false)。

出力は必ず次のJSON形式のみで返してください:
{"remove": true}

---
タイトル: ${title}
要約: ${summary}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }]
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const parsed = parseJsonResponse(text);
  return parsed.remove === true;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: items, error } = await supabase.from("items").select("id, title, summary");
  if (error) throw error;

  console.log(`判定対象: ${items.length}件`);
  const toDelete = [];
  for (const item of items) {
    let remove;
    try {
      remove = await shouldRemove(anthropic, item.title, item.summary);
    } catch (err) {
      console.error(`  [skip-on-error] ${item.title}: ${err.message}`);
      continue;
    }
    console.log(`  [${remove ? "DELETE" : "keep"}] ${item.title}`);
    if (remove) toDelete.push(item.id);
  }

  console.log(`\n削除対象: ${toDelete.length}件`);
  if (toDelete.length === 0) return;

  const { error: deleteError } = await supabase.from("items").delete().in("id", toDelete);
  if (deleteError) throw deleteError;
  console.log("削除完了");
}

main();
