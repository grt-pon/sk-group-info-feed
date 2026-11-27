import { collectPrpcExportPrices } from "../src/collectors/direct/prpcExportPrices.js";

// 古紙再生促進センターの輸出統計PDFは月1回しか更新されないため、日次のscripts/runOnce.jsとは
// 分離し、.github/workflows/collect-paper-prices.ymlから月次で呼び出す専用スクリプト。
async function main() {
  console.log("=== 古紙再生促進センター(輸出統計・相場) ===");
  const results = await collectPrpcExportPrices();
  for (const r of results) {
    if (r.skipped) {
      console.log(`  - スキップ(${r.reason}): ${r.title}`);
    } else {
      console.log(`  - 保存: ${r.title}`);
    }
  }
}

main();
