import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIES } from "../config/categories.js";
import { WATCHED_LAWS } from "../config/watchedLaws.js";

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
 * @returns {Promise<{
 *   title: string, summary: string, categories: string[], isNewsworthy: boolean,
 *   isImportant: boolean, region: string, sourceType: string, isPaywalled: boolean
 * }>}
 */
export async function summarizeAndClassify({ title, rawText, ruleCategories }) {
  const anthropic = getClient();

  const prompt = `あなたは古紙・廃棄物業界の社内情報ポータル向けに記事を要約するアシスタントです。
以下の記事を読み、次の8つを出力してください。

1. タイトル(記事内容を表す自然な日本語の見出し。元のタイトルが文字化けしている・意味不明・英語や記号だらけで内容が分からない場合は、本文から新しく作り直す。元のタイトルが正常に読めて内容も適切に表しているなら、それをそのまま使ってよい。
   重要: 本文で実際に述べられている範囲を超えて話を大きく見せる・煽るような見出しにしないこと。読者がタイトルだけを見て、実際の記事内容について誤った印象(実際より重大・確定的・断定的など)を持つことがないようにする)
2. 要約(2〜3文。表示スペースが狭く、タイトルと要約の冒頭が同じ内容を繰り返すと無駄になるため、
   タイトルで既に分かる内容(見出しそのもの)は繰り返さず、1文目からタイトルに書かれていない
   具体的な情報(数値・背景・経緯・影響など)で始める。「発表内容→背景→影響」を意識しつつ、
   元文の言い回しをそのまま使わず自分の言葉で書く)
3. カテゴリ(次の12個から、内容に合うものを1〜2個選ぶ): ${CATEGORIES.join("、")}
4. ニュース価値の有無(isNewsworthy: true/false)。以下に該当する場合はfalseにする:
   - 「○○統計を更新しました」「需給速報を更新」のように、定例の統計・資料ページが更新されたという事実だけで、
     具体的な数値・変化・トレンドなど読者が持ち帰れる情報が本文中にない場合
   - 単なる会議・資料公開の告知で、何が話し合われた・決まったのかが本文からも分からない場合
   - 特定の一業者が自社の買取価格・相場を掲示しているだけの定型ページ(「本日の買取価格」
     「価格表」のように、日々更新される価格の一覧そのものが内容で、背景や変化の理由の
     説明がないもの)。たとえ具体的な金額が書かれていても、単なる価格表・相場一覧ページは
     falseにする
   - シンポジウム・フォーラム・勉強会等を「開催します」「開催しました」という告知・報告だけで、
     そこで何が発表された・話し合われた・決まったのかという中身が本文にない場合
   - 一企業が「寄付した」「イベントに参加した」「出展した」程度の、自社の軽微な活動報告
     (その企業の自社サイトのお知らせ欄に載る程度の内容)。
     ただし、その企業自身が主催者となり複数の企業・自治体等を巻き込んで行われた規模のイベントで、
     かつ自社サイトの告知だけでなく一般のニュースとしても報じられている場合はtrueとする
   - 国・自治体等が実施する補助金・委託事業等の「公募を開始します」「公募の採択結果はこちらです」
     という事務手続きの告知・結果公表だけで、単に採択事業者名や件数が列挙されているだけの場合
     (業界への政策的な影響や、具体的に何が変わるのかの説明がないもの)
   具体的な数値や、何が起きた/決まった/変化したかが分かる内容であればtrueにする。
   (統計の更新であっても、本文に「回収率が81.3%になった」のような具体的な中身があればtrueでよい)
   なお、パッカー車・収集車・清掃車・トラック等が関係する人身事故・死亡事故・火災は、
   社内のドライバーへの注意喚起として重要なため、一企業の軽微な活動報告の例外として
   常にisNewsworthy: trueとする(上記の「軽微な活動報告」の除外対象にはしない)。
5. 重要度(isImportant: true/false)。次の監視対象法令について、実際に改正(法改正・政省令改正・
   施行規則改正・施行日決定等)があったという具体的な内容である場合のみtrueにする。
   単なる法解釈の説明・セミナー告知・過去の内容のおさらいはfalseとする:
   ${WATCHED_LAWS.join("、")}
6. 地域(region)。次のいずれか1つ: "仙台市"、"仙台経済圏"(仙台市近郊、例: 名取市・多賀城市・富谷市・利府町・大和町等)、"宮城県"(仙台市・仙台経済圏以外の宮城県内)、"東北"(青森・岩手・秋田・山形・福島の各県。宮城県以外)、"全国・海外"(特定地域に限定されない、または上記以外の地域)。
   本文中に具体的な地名が出てこない場合は"全国・海外"とする。
7. 発信者の種別(sourceType)。次のいずれか1つ: "官公庁"(国・都道府県・市区町村等)、"業界団体"(組合・協会・連合会等)、"企業"(企業の公式発表・プレスリリース・自社サイト記事)、"報道機関"(新聞社・通信社・ニュースメディアによる取材記事)、"個人・SNS"(個人のnote・ブログ・SNS投稿等)。
8. 有料記事かどうか(isPaywalled: true/false)。本文が会員登録・購読契約をしないと続きが読めない状態で、
   途中で本文が途切れている、または「続きを読むには」「この記事は有料会員限定です」等の案内がある場合はtrue。
   本文を最後まで読める場合はfalse。

キーワードルールによる一次判定では ${ruleCategories.length > 0 ? ruleCategories.join("、") : "該当なし"} が候補になっています。この候補を参考にしつつ、実際の内容に照らして最終的なカテゴリを判断してください(候補と異なってもよい)。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"title": "...", "summary": "...", "categories": ["..."], "isNewsworthy": true, "isImportant": false, "region": "全国・海外", "sourceType": "企業", "isPaywalled": false}

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
      isNewsworthy: parsed.isNewsworthy !== false,
      isImportant: parsed.isImportant === true,
      region: parsed.region || "全国・海外",
      sourceType: parsed.sourceType || "企業",
      isPaywalled: parsed.isPaywalled === true
    };
  } catch (err) {
    throw new Error(`Claudeの出力をJSONとして解釈できませんでした: ${text}`);
  }
}

/**
 * 記事本文から品目別の相場(価格)情報を抽出する。相場推移グラフ(品目ごとの価格の時系列)の
 * データソースとして使う。本文に具体的な数値が無い場合は空配列を返す。
 * ingest.js側で、カテゴリに「資源相場」が含まれる記事に対してのみ呼び出す想定
 * (関係ない記事にまでAPIを呼ぶコストを避けるため)。
 * @param {{ title: string, rawText: string }} input
 * @returns {Promise<Array<{ commodity: string, price: number, unit: string, priceDate: string | null }>>}
 */
export async function extractPricePoints({ title, rawText }) {
  const anthropic = getClient();

  const prompt = `以下の記事から、古紙・金属・プラスチック等の品目ごとの具体的な取引価格・相場を抽出してください。
抽出条件:
- 「○○(品目名)が1kgあたり○○円」のように、品目名と具体的な金額が明記されている箇所のみを対象とする
- 「上昇した」「下落した」のような傾向の説明だけで金額が書かれていない場合は抽出しない
- 本文中に価格の基準日・対象月が書かれていればpriceDateに"YYYY-MM-DD"形式で入れる(日が不明なら01とする)。書かれていなければnullとする
- 複数の品目・時点があれば配列に複数件入れてよい。該当なしの場合は空配列を返す

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"points": [{"commodity": "段ボール古紙", "price": 25, "unit": "円/kg", "priceDate": "2026-11-01"}]}

---
タイトル: ${title}

本文:
${rawText}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  try {
    const parsed = parseJsonResponse(text);
    return Array.isArray(parsed.points) ? parsed.points : [];
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

/**
 * タイトルの文字列類似度(titleSimilarity.js)で「確認する価値がある」と絞り込んだ候補について、
 * 本当に同じ具体的な出来事(同じプレスリリース・同じニュース)を指しているかを意味的に判定する。
 * 「○○省、A地方フォーラムを開催」「○○省、B地方フォーラムを開催」のように、文面のテンプレートは
 * 似ていても中身(対象地域・対象事業者等)が別物のケースを、文字列の近さだけでは区別できないため
 * この確認を挟む。
 * @param {{ titleA: string, titleB: string }} input
 * @returns {Promise<boolean>}
 */
export async function isSameStory({ titleA, titleB }) {
  const anthropic = getClient();

  const prompt = `以下の2つの記事タイトルが、同じ具体的な出来事(同じプレスリリース・同じニュース)を
報じたものかどうかを判定してください。
言い回しのテンプレートが似ているだけで、対象地域・対象企業・対象事業などの中身が異なる場合
(例: 「○○省がA地方でフォーラムを開催」と「○○省がB地方でフォーラムを開催」)は、
同じ出来事ではない(same: false)と判定してください。

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"same": true または false}

---
タイトルA: ${titleA}
タイトルB: ${titleB}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 100,
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  try {
    const parsed = parseJsonResponse(text);
    return parsed.same === true;
  } catch (err) {
    throw new Error(`Claudeの出力をJSONとして解釈できませんでした: ${text}`);
  }
}

/**
 * region/sourceType/isPaywalled/isImportant の4項目(2026-11-26の機能追加分)を、
 * 既存記事(保存済みのタイトル・要約)に遡って付与するためのバックフィル専用関数。
 * 元記事の全文は保存していないため、可能なら呼び出し側で元ページを再取得したrawTextを渡し、
 * 取得できない場合はタイトル・要約だけでの判定にフォールバックする想定
 * (その場合isPaywalledの判定精度は落ちるため、不明な場合はfalse寄りに倒す)。
 * @param {{ title: string, summary: string, sourceName: string, rawText?: string | null }} input
 * @returns {Promise<{ region: string, sourceType: string, isPaywalled: boolean, isImportant: boolean }>}
 */
export async function classifyExistingItem({ title, summary, sourceName, rawText }) {
  const anthropic = getClient();

  const bodyText = rawText && rawText.trim() ? rawText : `(元記事全文は取得できなかったため、要約のみで判定します)\n${summary}`;

  const prompt = `あなたは古紙・廃棄物業界の社内情報ポータルの記事に、後から分類ラベルを付け直すアシスタントです。
以下の記事(タイトル・情報源・本文または要約)を読み、次の4つを判定してください。

1. 地域(region)。次のいずれか1つ: "仙台市"、"仙台経済圏"(仙台市近郊、例: 名取市・多賀城市・富谷市・利府町・大和町等)、"宮城県"(仙台市・仙台経済圏以外の宮城県内)、"東北"(青森・岩手・秋田・山形・福島の各県。宮城県以外)、"全国・海外"(特定地域に限定されない、または上記以外の地域)。
   具体的な地名が出てこない場合は"全国・海外"とする。
2. 発信者の種別(sourceType)。次のいずれか1つ: "官公庁"(国・都道府県・市区町村等)、"業界団体"(組合・協会・連合会等)、"企業"(企業の公式発表・プレスリリース・自社サイト記事)、"報道機関"(新聞社・通信社・ニュースメディアによる取材記事)、"個人・SNS"(個人のnote・ブログ・SNS投稿等)。
3. 有料記事かどうか(isPaywalled: true/false)。本文が会員登録・購読契約をしないと続きが読めない状態で、
   途中で本文が途切れている、または「続きを読むには」「この記事は有料会員限定です」等の案内がある場合はtrue。
   判断材料が無い・最後まで読める場合はfalse。
4. 重要度(isImportant: true/false)。次の監視対象法令について、実際に改正(法改正・政省令改正・
   施行規則改正・施行日決定等)があったという具体的な内容である場合のみtrueにする:
   ${WATCHED_LAWS.join("、")}

出力は必ず次のJSON形式のみで返してください(説明文や前置きは不要):
{"region": "全国・海外", "sourceType": "企業", "isPaywalled": false, "isImportant": false}

---
タイトル: ${title}
情報源: ${sourceName}

本文または要約:
${bodyText}
`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
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
      region: parsed.region || "全国・海外",
      sourceType: parsed.sourceType || "企業",
      isPaywalled: parsed.isPaywalled === true,
      isImportant: parsed.isImportant === true
    };
  } catch (err) {
    throw new Error(`Claudeの出力をJSONとして解釈できませんでした: ${text}`);
  }
}
