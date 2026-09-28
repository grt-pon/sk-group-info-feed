import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Firestoreがまだセットアップされていなくても一連の流れを確認できるようにする、
// ローカルファイル(JSON)への保存先。firestore.jsと同じ関数シグネチャで実装している。
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const ITEMS_FILE = path.join(DATA_DIR, "items.json");

async function loadItems() {
  if (!existsSync(ITEMS_FILE)) return [];
  const raw = await readFile(ITEMS_FILE, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

async function persistItems(items) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ITEMS_FILE, JSON.stringify(items, null, 2), "utf-8");
}

/**
 * 同一URL・同一更新日の記事が既に保存済みかを調べる(重複排除用)。firestore.jsのexistsByUrlと同じ意味。
 * @param {string} sourceUrl
 * @param {string | null} publishedAt
 * @returns {Promise<boolean>}
 */
export async function existsByUrl(sourceUrl, publishedAt = null) {
  const items = await loadItems();
  return items.some(
    (item) => item.sourceUrl === sourceUrl && (item.publishedAt ?? null) === (publishedAt ?? null)
  );
}

/**
 * 収集・分類・要約済みの1件をローカルファイルに保存する。
 * @param {object} item
 * @returns {Promise<string>} 生成したID
 */
export async function saveItem(item) {
  const items = await loadItems();
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  items.push({ id, ...item, collectedAt: new Date().toISOString(), reactions: [] });
  await persistItems(items);
  return id;
}

/**
 * 記事に対する「要る/要らない」反応を記録する。
 * @param {string} itemId
 * @param {{ userId: string, judgement: "want" | "not_want" }} reaction
 */
export async function addReaction(itemId, reaction) {
  const items = await loadItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error(`ローカルストアに該当する記事が見つかりません: ${itemId}`);
  }
  item.reactions = item.reactions ?? [];
  item.reactions.push({ ...reaction, reactedAt: new Date().toISOString() });
  await persistItems(items);
}

/**
 * 保存済みの全記事を取得する(フロントエンド表示用)。
 * @returns {Promise<Array<object>>}
 */
export async function listItems() {
  return await loadItems();
}
