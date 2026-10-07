import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// 「タイトルと要約の冒頭が同じ内容を繰り返している」フィードバックを受けて、
// 既存記事の要約を(保存していない本文ではなく、既存のタイトル・要約を材料に)書き直す一回限りのスクリプト。
const MODEL = "claude-sonnet-5";

function parseJsonResponse(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(stripped);
}

async function rewriteSummary(anthropic, title, summary) {
  const prompt = `以下はニュース記事のタイトルと要約です。表示スペースが狭いため、
タイトルで既に分かる内容を要約の冒頭で繰り返さないよう書き直してください。
情報は減らさず、言い回しだけ変えて、タイトルに書かれていない部分から始めるようにしてください。
重複がそもそも無ければ、ほぼそのまま返してよい。

出力は必ず次のJSON形式のみで返してください:
{"summary": "..."}

---
タイトル: ${title}
要約: ${summary}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }]
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  const parsed = parseJsonResponse(text);
  return parsed.summary;
}

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { data: items, error } = await supabase.from("items").select("id, title, summary");
  if (error) throw error;

  console.log(`対象: ${items.length}件`);
  let updated = 0;
  for (const item of items) {
    let newSummary;
    try {
      newSummary = await rewriteSummary(anthropic, item.title, item.summary);
    } catch (err) {
      console.error(`  [skip-on-error] ${item.title}: ${err.message}`);
      continue;
    }
    if (!newSummary || newSummary === item.summary) {
      console.log(`  [unchanged] ${item.title}`);
      continue;
    }
    const { error: updateError } = await supabase.from("items").update({ summary: newSummary }).eq("id", item.id);
    if (updateError) {
      console.error(`  [update failed] ${item.title}: ${updateError.message}`);
      continue;
    }
    console.log(`  [updated] ${item.title}`);
    updated++;
  }

  console.log(`\n更新件数: ${updated}/${items.length}`);
}

main();
