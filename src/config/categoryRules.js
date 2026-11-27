// カテゴリ分類のルールベース一次判定。
// タイトル・本文にこれらのキーワードが含まれていたら、そのカテゴリの候補として扱う(複数カテゴリにマッチしてよい)。
// ここで拾いきれない/複数候補がある場合は、Claudeによる二次判定(pipeline/classify.js)で確定させる。
export const CATEGORY_RULES = {
  "行政・法改正": ["法改正", "施行規則", "改正省令", "法律案", "パブリックコメント", "審議会", "小委員会"],
  "企業の取り組み": ["プレスリリース", "資本提携", "業務提携", "新工場", "設備投資", "導入", "発表"],
  "リサイクル": ["リサイクルステーション", "資源回収", "再資源化", "リユース"],
  "産廃・処理業": ["産業廃棄物", "中間処理", "許可更新", "処理業", "排出事業者"],
  "資源相場": ["相場", "価格動向", "市況", "円/kg", "円/t", "輸出価格", "在庫"],
  "AI・DX": ["AI", "DX", "自動選別", "画像認識", "システム導入"],
  "海外": ["中国", "EU", "欧州", "輸出規制", "海外", "国際"],
  "電子マニフェスト": ["電子マニフェスト", "JWNET"],
  "行政処分": ["業務停止命令", "許可取消", "行政指導", "行政処分"],
  "事件・事故": ["事故", "火災", "違反", "逮捕", "送検"],
  "業界動向": ["開業", "閉店", "入札", "業界動向", "市場規模"],
  // 「トラック」のような一般語を含めると、トラックが絡む一般の交通事故記事まで
  // このカテゴリの候補になってしまったため、次世代エネルギー車両の動向を示す語に絞った。
  // パッカー車等の事故は「事件・事故」カテゴリのみで扱い、このカテゴリには含めない。
  "車両・モビリティ": ["商用車", "EVトラック", "水素トラック", "FCVトラック", "電動化", "次世代エネルギー"]
};

/**
 * タイトル・本文からキーワードルールに基づくカテゴリ候補を返す。
 * @param {string} text
 * @returns {string[]} マッチしたカテゴリ名の配列(0件のこともある)
 */
export function matchCategoriesByRule(text) {
  const matched = [];
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some((kw) => text.includes(kw))) {
      matched.push(category);
    }
  }
  return matched;
}

// 古紙・廃棄物と全く無関係な発表(観光・人事・防災訓練など)が大量に混ざる情報源
// (都道府県・市区町村の全庁お知らせ一覧、日経の地域面など)を事前にふるい落とすための、
// トピック自体の関連性判定キーワード。CATEGORY_RULES(カテゴリの振り分け)とは目的が異なる。
const TOPIC_KEYWORDS = [
  "古紙", "廃棄物", "リサイクル", "資源循環", "産業廃棄物", "一般廃棄物",
  "ごみ", "ゴミ", "循環経済", "サーキュラーエコノミー", "再資源化", "資源ごみ",
  "分別", "製紙", "パルプ", "段ボール", "古紙相場", "リユース", "3R",
  "資源回収", "処理業", "不法投棄", "電子マニフェスト",
  // 車両・事故情報(ドライバーへの注意喚起・次世代エネルギー車両の動向)を拾うための追加キーワード。
  // 一般的な「トラック」「事故」だけだと無関係なニュースが大量に混ざるため、
  // 収集運搬業務に直結する車種・用語に絞って追加している。
  "パッカー車", "収集車", "清掃車", "EVトラック", "水素トラック", "FCVトラック", "次世代エネルギー車"
];

/**
 * タイトル・本文が古紙・廃棄物業界と関連のありそうな内容かをざっくり判定する。
 * 情報源を絞れない全庁お知らせ一覧のような場所を監視する際の事前フィルタとして使う。
 * @param {string} text
 * @returns {boolean}
 */
export function isRelevantTopic(text) {
  return TOPIC_KEYWORDS.some((kw) => text.includes(kw));
}

// 「古紙」を含むが、ニュース性のない自治体の分別案内・ごみ出しルールのような
// 定型ページを弾くためのパターン。一般キーワード監視(Tavily)で大量に混ざったため追加した。
const DISPOSAL_GUIDE_PATTERNS = [
  "の出し方", "の分け方", "分別収集", "ごみカレンダー", "収集カレンダー",
  "ごみの分け方", "資源物の分け方", "分別ルール", "ごみ出し", "拠点回収"
];

// 「古紙　横浜市」「古紙類 - 茅ヶ崎市」のような、市区町村名で終わる短いタイトルも
// 自治体の案内ページである可能性が高いため、この形もノイズとして扱う。
const MUNICIPALITY_SUFFIX = /(市|区|町|村)\s*$/;

/**
 * タイトルが自治体の「ごみの出し方」的な定型案内ページらしいかを判定する。
 * @param {string} title
 * @returns {boolean}
 */
export function isLikelyDisposalGuide(title) {
  if (DISPOSAL_GUIDE_PATTERNS.some((p) => title.includes(p))) return true;
  if (title.length <= 20 && MUNICIPALITY_SUFFIX.test(title.trim())) return true;
  return false;
}

// 用語集(用語の解説ページ。ニュースではない)、2ch/5ch系のまとめ・転載サイト、中国版Wikipedia、
// Q&A掲示板、市場調査会社の定型プレスリリース(「〇〇市場、20XX年に〇億ドル規模へ」のような
// テンプレ文面で自社の有料レポートへ誘導する内容。商材を変えて量産されている)、SNS投稿
// (公式アカウントの発信であっても、同じ内容は発信元の公式サイト・プレスリリースに載るはずで、
// SNS投稿をリンク先にする必要がない。リンク切れ・ログイン要求のリスクも高いため一律除外する)
// のURLパターン。実際に混入した事例をもとに追加した。
// ニュースらしい見出しが付いていても、URL自体がこれらに該当する場合は除外する。
const LOW_QUALITY_URL_PATTERNS = [
  "/dictionary/",
  "2nn.jp",
  "5ch.net",
  "2ch.net",
  "open2ch.net",
  "matomame",
  "matome",
  "baike.baidu.com",
  "chiebukuro.yahoo.co.jp",
  "hida-ch.com",
  "exblog.jp",
  // 市場調査会社の定型プレスリリース
  "straitsresearch.com",
  "imarcgroup.com",
  "mordorintelligence.com",
  "fortunebusinessinsights.com",
  "procurementresource.com",
  // 営業ノウハウ系ブログ等、実質的には自社サービスへの集客を目的とした企業向けコンテンツマーケティング
  // (ニュースではなく「値上げ交渉の進め方」のようなノウハウ記事)
  "eigyo-shindan.com",
  // SNS全般
  "x.com",
  "twitter.com",
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "threads.com",
  "linkedin.com",
  "tiktok.com"
];

/**
 * URLが用語集ページ・2ch系まとめサイト等、発信元として不適切な定型パターンに
 * 一致するかを判定する。
 * @param {string} url
 * @returns {boolean}
 */
export function isLowQualitySourceUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return LOW_QUALITY_URL_PATTERNS.some((p) => lower.includes(p));
}
