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

export const existsByUrl = backend.existsByUrl;
export const saveItem = backend.saveItem;
export const addReaction = backend.addReaction;
export const listItems = backend.listItems;
