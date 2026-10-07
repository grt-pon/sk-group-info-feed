import "dotenv/config";
import * as supabaseStore from "./supabaseStore.js";
import * as firestoreStore from "./firestore.js";
import * as localStore from "./localStore.js";

// 優先順位: Supabase(SUPABASE_URLがあれば、他の人も見られる共有DB) > Firestore(FIRESTORE_PROJECT_IDがあれば)
// > ローカルファイル(data/items.json、どちらも未設定の場合のフォールバック)。
// パイプライン(pipeline/ingest.js)・フロントエンド用API(server.js)は、どちらの保存先かを
// 意識せずこのモジュールだけを使う。
let backend;
let backendName;
if (process.env.SUPABASE_URL) {
  backend = supabaseStore;
  backendName = "Supabase";
} else if (process.env.FIRESTORE_PROJECT_ID) {
  backend = firestoreStore;
  backendName = "Firestore";
} else {
  backend = localStore;
  backendName = "ローカルファイル(data/items.json)";
}

console.log(`[store] 保存先: ${backendName}`);

// 「不要」が一定数以上ついた記事は、個人の一存ではなく複数人の判断が揃ったとみなして非表示にする。
// (同じ仕組みをfunctions/api/items.js側でも別実装している。Cloudflare Pages Functionsは
//  Workersランタイムで動く別プロセスのため、このファイルをそのままimportできない)
export const NOT_WANT_HIDE_THRESHOLD = 3;

function isHiddenByReactions(item) {
  // 同じ人の連打で非表示にならないよう、userId(ブラウザごとの簡易ID)の重複を除いて数える。
  const notWantUsers = new Set(
    (item.reactions || []).filter((r) => r.judgement === "not_want").map((r) => r.userId)
  );
  return notWantUsers.size >= NOT_WANT_HIDE_THRESHOLD;
}

export const existsByUrl = backend.existsByUrl;
export const saveItem = backend.saveItem;
export const addReaction = backend.addReaction;

export async function listItems() {
  const items = await backend.listItems();
  return items.filter((item) => !isHiddenByReactions(item));
}
