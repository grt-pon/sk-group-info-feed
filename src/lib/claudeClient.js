import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "../config/categories.js";

const MODEL = "claude-sonnet-5";

let client;

// Claudeがコードフェンス(```json ... ```)で囲んで返すことがあるため、JSON.parse前に取り除く。
function parseJsonResponse(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(stripped);
}

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY が設定されていません。.env を設定してください。");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * 収集した記事本文を、独自タイトル・独自要約(発表内容/背景/影響)・カテゴリ候補の確定に変換する。
 * 元記事の全文はここには渡すが、保存するのはこの関数が生成したタイトル・要約のみとする。
 *
 * タイトルも独自生成するのは、取得元によっては文字化け(取得元サイトの文字コードの問題で
 * Tavily側の抽出結果が化けているケース)や、英語・記号だらけで内容が分からないタイトルが
 * そのまま保存されてしまう事例があったため。元タイトルが正常に読めればそれを踏襲しつつ、
 * 化けている・分かりにくい場合は本文から自然なタイトルを作り直す。
 *
 * @param {{ title: string, rawText: string, ruleCategories: string[] }} input
 * @returns {Promise<{ title: string, summary: string, categories: string[], isNewsworthy: boolean }>}
 */
export async function summarizeAndClassify({ title, rawText, ruleCategories }) {
  const anthropic = getClient();

  const prompt = `あなたは古紙・廃棄物業界の社内情報ポータル向けに記事を要約するアシスタントです。
以下の記事を読み、次の4つを日本語で出力してください。

1. タイトル(記事内容を表す自然な日本語の見出し。元のタイトルが文字化けしている・意味不明・英語や記号だらけで内容が分からない場合は、本文から新しく作り直す。元のタイトルが正常に読めて内容も適切に表しているなら、それをそのまま使ってよい)
2. 要約(2〜3文。表示スペースが狭く、タイトルと要約の冒頭が同じ内容を繰り返すと無駄になるため、
   タイトルで既に分かる内容(見出しそのもの)は繰り返さず、1文目からタイトルに書かれていない
   具体的な情報(数値・背景・経緯・影響など)で始める。「発表内容→背景→影響」を意識しつつ、
   元文の言い回しをそのまま使わず自分の言葉で書く)
3. カテゴリ(次の11個から、内容に合うものを1〜2個選ぶ): ${CATEGORIES.join("、")}
4. ニュース価値の有無(isNewsworthy: true/false)。以下に該当する場合はfalseにする:
   - 「○○統計を更新しました」「需給速報を更新」のように、定例の統計・資料ページが更新されたという事実だけで、
     具体的な数値・変化・トレンドなど読者が持ち帰れる情報が本文中にない場合
   - 単なる会議・資料公開の告知で、何が話し合われた・決まったのかが本文からも分からない場合
   具体的な数値や、何が起きた/決まった/変化したかが分かる内容であればtrueにする。
   (統計の更新であっても、本文に「回収率が81.3%になった」のような具体的な中身があればtrueでよい)

キーワードルールによる一次判定では ${ruleCategories.length > 0 ? ruleCategories.join("、") : "該当なし"} が候補になっています。この候補を参考にしつつ、実際の内容に照らして最終的なカテゴリを判断してください(候補と異なってもよい)。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"title": "...", "summary": "...", "categories": ["..."], "isNewsworthy": true}

---
元のタイトル: ${title}

本文:
${rawText}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  try {
    const parsed = parseJsonResponse(text);
    return {
      title: parsed.title || title,
      summary: parsed.summary,
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      isNewsworthy: parsed.isNewsworthy !== false
    };
  } catch (err) {
    throw new Error(`Claudeの出力をJSONとして解釈できませんでした: ${text}`);
  }
}

/**
 * 検索で見つかった候補が、見出しの指す出来事の一次情報として本当に対応しているかを判定する。
 * ドメイン(.go.jp等)だけでの判定は「たまたま同じ分野の無関係な文書」を誤って一次情報扱いしてしまう
 * ことがあったため(例:企業の総会案内に内閣府の資料が紐づく等)、内容面でも検証するために使う。
 *
 * @param {{ headlineTitle: string, headlineOrg: string, candidateTitle: string, candidateContent: string }} input
 * @returns {Promise<boolean>}
 */
export async function isMatchingPrimarySource({ headlineTitle, headlineOrg, candidateTitle, candidateContent }) {
  const anthropic = getClient();

  const prompt = `以下の「見出し」が指す出来事について、「候補」が本当にその一次情報(発信元による公式発表・プレスリリース等)として対応しているかを判定してください。
発信元組織名や出来事の内容が一致していない場合(たまたま同じ分野・キーワードを含むだけの無関係な文書である場合)は「対応していない」と判定してください。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"matches": true または false}

---
見出し: ${headlineTitle}
発信元組織: ${headlineOrg}

候補のタイトル: ${candidateTitle}
候補の内容抜粋: ${candidateContent.slice(0, 500)}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  try {
    const parsed = parseJsonResponse(text);
    return parsed.matches === true;
  } catch (err) {
    throw new Error(`Claudeの出力をJSONとして解釈できませんでした: ${text}`);
  }
}
