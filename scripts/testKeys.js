// ClaudeとTavilyのAPIキーだけが正しく機能するかを確認する開発用スクリプト。Firestoreには一切触れない。
import { summarizeAndClassify } from "../src/lib/claudeClient.js";
import { searchRecent } from "../src/lib/tavilyClient.js";

async function main() {
  console.log("=== Claude(要約・分類)のテスト ===");
  try {
    const result = await summarizeAndClassify({
      title: "環境省、廃棄物処理法の分別基準を改正 プラスチック類の区分見直しへ",
      rawText:
        "環境省は9月8日、廃棄物処理法施行規則の一部改正を公布し、プラスチック類の分別区分を見直すと発表した。資源循環促進法との整合を図る狙いがあり、現場の分別ルールや許可証の記載事項の見直しが必要になる可能性がある。",
      ruleCategories: ["行政・法改正"]
    });
    console.log("OK:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("失敗:", err.message);
  }

  console.log("\n=== Tavily(キーワード検索)のテスト ===");
  try {
    const results = await searchRecent("古紙 相場", { days: 7, maxResults: 3 });
    console.log(`OK: ${results.length}件`);
    for (const r of results) {
      console.log(`- ${r.title} (${r.url})`);
    }
  } catch (err) {
    console.error("失敗:", err.message);
  }
}

main();
