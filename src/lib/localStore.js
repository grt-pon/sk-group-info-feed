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

/**
 * 記事から抽出した品目別の価格ポイントを保存する(相場推移グラフ用)。ローカル開発時は簡易ファイルに保存する。
 * @param {string} itemId
 * @param {Array<{ commodity: string, price: number, unit: string, priceDate: string | null }>} points
 */
export async function savePricePoints(itemId, points) {
  if (!points || points.length === 0) return;
  const file = path.join(DATA_DIR, "pricePoints.json");
  const existing = existsSync(file) ? JSON.parse(await readFile(file, "utf-8")) : [];
  const rows = points.map((p) => ({
    itemId,
    commodity: p.commodity,
    price: p.price,
    unit: p.unit ?? null,
    priceDate: p.priceDate ?? new Date().toISOString().slice(0, 10)
  }));
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, JSON.stringify([...existing, ...rows], null, 2), "utf-8");
}

/**
 * 記事の閲覧回数を1増やす。
 * @param {string} itemId
 */
export async function incrementViewCount(itemId) {
  const items = await loadItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`ローカルストアに該当する記事が見つかりません: ${itemId}`);
  item.viewCount = (item.viewCount ?? 0) + 1;
  await persistItems(items);
}

/**
 * サイト全体のページ閲覧ログを1件記録する(インプレッション分析レポート用)。
 */
export async function logPageView() {
  const file = path.join(DATA_DIR, "pageViews.json");
  const existing = existsSync(file) ? JSON.parse(await readFile(file, "utf-8")) : [];
  existing.push({ viewedAt: new Date().toISOString() });
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(existing, null, 2), "utf-8");
}
