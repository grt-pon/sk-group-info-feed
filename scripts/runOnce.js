import { collectPrpc } from "../src/collectors/direct/prpc.js";
import { collectJpa } from "../src/collectors/direct/jpa.js";
import { collectKantoshoso } from "../src/collectors/direct/kantoshoso.js";
import { collectMeti } from "../src/collectors/direct/meti.js";
import { collectMofTrade } from "../src/collectors/direct/mof-trade.js";
import { collectZengenren } from "../src/collectors/direct/zengenren.js";
import { collectByKeywordWatch } from "../src/collectors/keyword/tavilyMonitor.js";
import { collectJunkanKeizaiShimbun } from "../src/collectors/keyword/junkanKeizaiShimbun.js";
import { collectEnv } from "../src/collectors/direct/env.js";
import { collectMiyagi } from "../src/collectors/direct/miyagi.js";
import { collectSendai } from "../src/collectors/direct/sendai.js";
import { collectNikkeiLocalTohoku } from "../src/collectors/keyword/nikkeiLocal.js";

// 未実装のものも並べておき、実装が進んだらここに手を加えずそのまま動くようにする。
const COLLECTORS = [
  { name: "古紙再生促進センター", run: collectPrpc },
  { name: "日本製紙連合会", run: collectJpa },
  { name: "関東製紙原料直納商工組合", run: collectKantoshoso },
  { name: "経済産業省", run: collectMeti },
  { name: "環境省(資源循環)", run: collectEnv },
  { name: "財務省貿易統計", run: collectMofTrade },
  { name: "全国製紙原料商工組合連合会", run: collectZengenren },
  { name: "一般キーワード監視(Tavily)", run: collectByKeywordWatch },
  { name: "循環経済新聞", run: collectJunkanKeizaiShimbun },
  { name: "宮城県", run: collectMiyagi },
  { name: "仙台市", run: collectSendai },
  { name: "日経地域面(東北)", run: collectNikkeiLocalTohoku }
];

async function main() {
  for (const collector of COLLECTORS) {
    console.log(`\n=== ${collector.name} ===`);
    try {
      const results = await collector.run();
      console.log(`  取得: ${results.length}件`);
      for (const r of results) {
        if (r.skipped) {
          console.log(`  - スキップ(${r.reason}): ${r.title}`);
        } else {
          console.log(`  - 保存(${r.itemId}): ${r.title}`);
        }
      }
    } catch (err) {
      console.error(`  失敗: ${err.message}`);
    }
  }
}

main();
