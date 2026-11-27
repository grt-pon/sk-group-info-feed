import { extractPaperExportPrices } from "../../lib/claudeClient.js";
import { upsertOfficialPricePoint } from "../../lib/supabaseStore.js";

const SOURCE_NAME = "古紙再生促進センター(貿易統計)";
const PDF_URL = "http://www.prpc.or.jp/wp-content/uploads/yusyutu.pdf";

// 古紙再生促進センターが財務省貿易統計をもとに毎月公表する輸出実績から、
// 新聞古紙・雑誌古紙・段ボール古紙の単価(輸出金額÷輸出数量)を計算して保存する。
// 他の収集元(items)とは異なり、記事としては保存しない。相場推移グラフの
// 月次の確実な基準値としてprice_pointsテーブルに直接保存する専用の仕組み。
const FIELD_TO_COMMODITY = {
  newspaper: "新聞古紙",
  magazine: "雑誌古紙",
  cardboard: "段ボール古紙"
};

/**
 * 古紙再生促進センターの輸出実績PDFを取得し、品目ごとの単価を計算して保存する。
 * @returns {Promise<Array<{ title: string, skipped: boolean, reason?: string }>>}
 */
export async function collectPrpcExportPrices() {
  const results = [];

  let buffer;
  try {
    const res = await fetch(PDF_URL);
    if (!res.ok) {
      throw new Error(`PDF取得に失敗しました: ${res.status}`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    results.push({ title: SOURCE_NAME, skipped: true, reason: `error: ${err.message}` });
    return results;
  }

  let extracted;
  try {
    extracted = await extractPaperExportPrices(buffer);
  } catch (err) {
    results.push({ title: SOURCE_NAME, skipped: true, reason: `error: ${err.message}` });
    return results;
  }

  const priceDate = `${extracted.month}-01`;

  for (const [field, commodity] of Object.entries(FIELD_TO_COMMODITY)) {
    const data = extracted[field];
    // 1品目の計算失敗で他の品目まで巻き込んで取りこぼさないよう、1品目ごとにtry/catchで囲む。
    try {
      if (!data || !data.quantityTon || !data.valueFobThousandYen) {
        results.push({ title: `${commodity}(${extracted.month})`, skipped: true, reason: "no_data" });
        continue;
      }
      // 金額の単位は千円なので1000倍し、数量(トン)で割って円/トンの単価を出す。
      const pricePerTon = Math.round((data.valueFobThousandYen * 1000) / data.quantityTon);
      await upsertOfficialPricePoint(commodity, pricePerTon, "円/トン", priceDate);
      results.push({ title: `${commodity}(${extracted.month}): ${pricePerTon}円/トン`, skipped: false });
    } catch (err) {
      results.push({ title: `${commodity}(${extracted.month})`, skipped: true, reason: `error: ${err.message}` });
    }
  }

  return results;
}
