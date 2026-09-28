// Firestoreなしで、実際に収集→要約・分類まで行い、結果をJSONで出力する確認用スクリプト。
// フロントエンドのモックアップに実データを反映するための下準備。
import { writeFile } from "node:fs/promises";
import { fetchNewsList as fetchPrpcNews, SOURCE_ID as PRPC_ID, SOURCE_NAME as PRPC_NAME } from "../src/collectors/direct/prpc.js";
import { fetchNewsList as fetchJpaNews, SOURCE_ID as JPA_ID, SOURCE_NAME as JPA_NAME } from "../src/collectors/direct/jpa.js";
import { fetchPriceLinks, SOURCE_ID as KANTO_ID, SOURCE_NAME as KANTO_NAME } from "../src/collectors/direct/kantoshoso.js";
import { fetchPressReleaseList as fetchEnvNews, SOURCE_ID as ENV_ID, SOURCE_NAME as ENV_NAME } from "../src/collectors/direct/env.js";
import { fetchMeetingList as fetchMetiMeetings, SOURCE_ID as METI_ID, SOURCE_NAME as METI_NAME } from "../src/collectors/direct/meti.js";
import { searchRecent } from "../src/lib/tavilyClient.js";
import { matchCategoriesByRule } from "../src/config/categoryRules.js";
import { summarizeAndClassify } from "../src/lib/claudeClient.js";

const MAX_PER_SOURCE = 3;

async function buildRawItems() {
  const items = [];

  const prpcNews = (await fetchPrpcNews(new Date().getFullYear())).slice(0, MAX_PER_SOURCE);
  for (const n of prpcNews) {
    items.push({
      title: n.title,
      rawText: n.title,
      sourceUrl: n.url,
      sourceId: PRPC_ID,
      sourceName: PRPC_NAME,
      isPrimarySource: true,
      publishedAt: n.publishedAt
    });
  }

  const jpaNews = (await fetchJpaNews()).slice(0, MAX_PER_SOURCE);
  for (const n of jpaNews) {
    items.push({
      title: n.title,
      rawText: n.title,
      sourceUrl: n.url,
      sourceId: JPA_ID,
      sourceName: JPA_NAME,
      isPrimarySource: true,
      publishedAt: n.publishedAt
    });
  }

  const priceLinks = (await fetchPriceLinks()).slice(0, 1); // 同一PDFが重複掲載されているため1件のみ
  for (const p of priceLinks) {
    items.push({
      title: `古紙輸出価格動向表: ${p.title}`,
      rawText: `関東製紙原料直納商工組合が公表した古紙輸出価格の資料「${p.title}」が更新されました。`,
      sourceUrl: p.url,
      sourceId: KANTO_ID,
      sourceName: KANTO_NAME,
      isPrimarySource: true,
      publishedAt: null
    });
  }

  const envNews = (await fetchEnvNews()).slice(0, MAX_PER_SOURCE);
  for (const n of envNews) {
    items.push({
      title: n.title,
      rawText: n.title,
      sourceUrl: n.url,
      sourceId: ENV_ID,
      sourceName: ENV_NAME,
      isPrimarySource: true,
      publishedAt: n.publishedAt
    });
  }

  const metiMeetings = (await fetchMetiMeetings()).slice(0, 1);
  for (const m of metiMeetings) {
    items.push({
      title: `産業構造審議会 資源循環経済小委員会 ${m.title}`,
      rawText: `経済産業省の産業構造審議会 資源循環経済小委員会が「${m.title}」を開催した。`,
      sourceUrl: m.url,
      sourceId: METI_ID,
      sourceName: METI_NAME,
      isPrimarySource: true,
      publishedAt: m.publishedAt
    });
  }

  const tavilyResults = await searchRecent("古紙 リサイクル 業界", { days: 30, maxResults: MAX_PER_SOURCE });
  for (const r of tavilyResults) {
    items.push({
      title: r.title,
      rawText: r.content,
      sourceUrl: r.url,
      sourceId: "general-keyword-watch",
      sourceName: "一般キーワード監視(Tavily)",
      isPrimarySource: false,
      publishedAt: r.publishedDate
    });
  }

  return items;
}

async function main() {
  const rawItems = await buildRawItems();
  console.log(`収集した生データ: ${rawItems.length}件`);

  const results = [];
  for (const item of rawItems) {
    console.log(`- 分類・要約中: ${item.title}`);
    const ruleCategories = matchCategoriesByRule(`${item.title}\n${item.rawText}`);
    try {
      const { summary, categories } = await summarizeAndClassify({
        title: item.title,
        rawText: item.rawText,
        ruleCategories
      });
      results.push({
        title: item.title,
        summary,
        categories,
        sourceUrl: item.sourceUrl,
        sourceName: item.sourceName,
        isPrimarySource: item.isPrimarySource,
        publishedAt: item.publishedAt
      });
    } catch (err) {
      console.error(`  失敗: ${err.message}`);
    }
  }

  const outPath = new URL("../preview-output.json", import.meta.url);
  await writeFile(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n${results.length}件を preview-output.json に書き出しました。`);
}

main();
