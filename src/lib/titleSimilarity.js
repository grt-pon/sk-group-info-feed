// 同じプレスリリースが別サイトに転載され、URLは異なるがタイトルがほぼ同じ、というケースの
// 重複検出に使う。文字bigram(2文字の組)の一致率(Dice係数)で近さを測る、簡易だが
// 日本語の分かち書き不要で扱える方法。

const NORMALIZE_PATTERN = /[\s　|｜・,、。.！!？?「」『』【】()（）\-ー–]/g;

function normalize(title) {
  return (title || "").replace(NORMALIZE_PATTERN, "").toLowerCase();
}

function bigrams(s) {
  const grams = [];
  for (let i = 0; i < s.length - 1; i++) grams.push(s.slice(i, i + 2));
  return grams;
}

/**
 * 2つのタイトルの類似度(0〜1、1が完全一致)をDice係数で計算する。
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function titleSimilarity(a, b) {
  const ga = bigrams(normalize(a));
  const gb = bigrams(normalize(b));
  if (ga.length === 0 || gb.length === 0) return 0;

  const counts = new Map();
  for (const g of gb) counts.set(g, (counts.get(g) || 0) + 1);

  let matches = 0;
  for (const g of ga) {
    const count = counts.get(g);
    if (count > 0) {
      matches++;
      counts.set(g, count - 1);
    }
  }
  return (2 * matches) / (ga.length + gb.length);
}

// この値以上で「確認する価値がある候補」とみなす(自動で重複確定はしない)。
// 実験したところ、「環境省、中部地方フォーラムを開催」と「環境省、北海道地方フォーラムを開催」
// のような"テンプレ文面は同じだが中身は別物"のケースでも0.74と高めの値が出ることが分かった。
// 文字列の近さだけでは判定を誤るため、この閾値はあくまで候補の絞り込みに使い、
// 実際に重複かどうかは claudeClient.isSameStory() で意味的に確認する。
export const CANDIDATE_THRESHOLD = 0.55;

/**
 * 候補タイトルの一覧から、類似度が閾値以上のものだけを返す(確認対象の絞り込み)。
 * @param {string} title
 * @param {Array<{ id: string, title: string }>} candidates
 * @returns {Array<{ id: string, title: string }>}
 */
export function findSimilarCandidates(title, candidates) {
  return candidates.filter((c) => titleSimilarity(title, c.title) >= CANDIDATE_THRESHOLD);
}
