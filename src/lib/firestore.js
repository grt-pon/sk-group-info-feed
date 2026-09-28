import "dotenv/config";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ITEMS_COLLECTION = "items";
const REACTIONS_SUBCOLLECTION = "reactions";

let db;

function getDb() {
  if (db) return db;

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = process.env.FIRESTORE_PROJECT_ID;

  if (!credentialsPath || !projectId) {
    throw new Error(
      "FIRESTORE_PROJECT_ID / GOOGLE_APPLICATION_CREDENTIALS が未設定です。.env を設定してください(.env.example参照)。"
    );
  }

  initializeApp({
    credential: applicationDefault(),
    projectId
  });
  db = getFirestore();
  return db;
}

/**
 * 同一URL・同一更新日の記事が既に保存済みかを調べる(重複排除用)。
 * URLだけで判定しないのは、「需給速報を更新しました」のように同じURLが
 * 日付を変えて繰り返しお知らせされるページがあるため(URLが同じでも別の更新は別記事として扱う)。
 * @param {string} sourceUrl
 * @param {string | null} publishedAt
 * @returns {Promise<boolean>}
 */
export async function existsByUrl(sourceUrl, publishedAt = null) {
  const snapshot = await getDb()
    .collection(ITEMS_COLLECTION)
    .where("sourceUrl", "==", sourceUrl)
    .where("publishedAt", "==", publishedAt)
    .limit(1)
    .get();
  return !snapshot.empty;
}

/**
 * 収集・分類・要約済みの1件を保存する。
 * 保存するのは要約(独自生成)であって、元記事の全文ではない。
 * @param {{
 *   title: string,
 *   summary: string,
 *   sourceUrl: string,
 *   sourceId: string,
 *   sourceName: string,
 *   isPrimarySource: boolean,
 *   categories: string[],
 *   publishedAt: string | null
 * }} item
 */
export async function saveItem(item) {
  const docRef = getDb().collection(ITEMS_COLLECTION).doc();
  await docRef.set({
    ...item,
    collectedAt: new Date().toISOString()
  });
  return docRef.id;
}

/**
 * 記事に対する「要る/要らない」反応を記録する。
 * この反応は記事の表示可否には即座に影響させない(集計してルール改善にのみ使う想定)。
 * @param {string} itemId
 * @param {{ userId: string, judgement: "want" | "not_want" }} reaction
 */
export async function addReaction(itemId, reaction) {
  await getDb()
    .collection(ITEMS_COLLECTION)
    .doc(itemId)
    .collection(REACTIONS_SUBCOLLECTION)
    .add({
      ...reaction,
      reactedAt: new Date().toISOString()
    });
}

/**
 * 保存済みの全記事を取得する(フロントエンド表示用)。
 * @returns {Promise<Array<object>>}
 */
export async function listItems() {
  const snapshot = await getDb().collection(ITEMS_COLLECTION).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
