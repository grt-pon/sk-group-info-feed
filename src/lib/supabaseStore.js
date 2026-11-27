import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// 他の人も同じデータを見られるようにするための共有DB(Supabase)への保存先。
// firestore.js / localStore.js と同じ関数シグネチャで実装している。
let client;

function getClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    // サーバー側(このNode.jsプログラム)からの書き込みはservice_roleキーを使う。
    // anonキーだとRLS(行レベルセキュリティ)の設定次第で書き込みが拒否されることがあるため。
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env を設定してください(.env.example参照)。"
      );
    }
    client = createClient(url, key);
  }
  return client;
}

/**
 * 同一URL・同一更新日の記事が既に保存済みかを調べる(重複排除用)。
 * @param {string} sourceUrl
 * @param {string | null} publishedAt
 * @returns {Promise<boolean>}
 */
export async function existsByUrl(sourceUrl, publishedAt = null) {
  const supabase = getClient();
  let query = supabase.from("items").select("id", { count: "exact", head: true }).eq("source_url", sourceUrl);
  query = publishedAt === null ? query.is("published_at", null) : query.eq("published_at", publishedAt);
  const { count, error } = await query;
  if (error) throw new Error(`Supabaseの重複チェックに失敗しました: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * 収集・分類・要約済みの1件をSupabaseに保存する。
 * @param {object} item
 * @returns {Promise<string>} 保存したレコードのid
 */
export async function saveItem(item) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      title: item.title,
      summary: item.summary,
      source_url: item.sourceUrl,
      source_id: item.sourceId,
      source_name: item.sourceName,
      is_primary_source: item.isPrimarySource,
      categories: item.categories,
      published_at: item.publishedAt,
      collected_at: new Date().toISOString(),
      is_important: item.isImportant ?? false,
      region: item.region ?? "全国・海外",
      source_type: item.sourceType ?? "企業",
      is_paywalled: item.isPaywalled ?? false
    })
    .select("id")
    .single();
  if (error) throw new Error(`Supabaseへの保存に失敗しました: ${error.message}`);
  return data.id;
}

/**
 * 記事から抽出した品目別の価格ポイントを保存する(相場推移グラフ用)。
 * 記事本体(items)は1ヶ月で自動削除されるが、price_pointsは別テーブルで独立して保存し、
 * 記事が消えても相場の推移データは残るようにする。
 * @param {string} itemId
 * @param {Array<{ commodity: string, price: number, unit: string, priceDate: string | null }>} points
 */
export async function savePricePoints(itemId, points) {
  if (!points || points.length === 0) return;
  const supabase = getClient();
  const rows = points.map((p) => ({
    item_id: itemId,
    commodity: p.commodity,
    price: p.price,
    unit: p.unit ?? null,
    price_date: p.priceDate ?? new Date().toISOString().slice(0, 10)
  }));
  const { error } = await supabase.from("price_points").insert(rows);
  if (error) throw new Error(`相場データの保存に失敗しました: ${error.message}`);
}

/**
 * 古紙再生促進センターの貿易統計(月次)から計算した、品目ごとの確実な単価を保存する。
 * item_idを持たない(特定の記事に紐づかない)点がsavePricePointsとの違い。
 * 同じ品目・同じ月の行が既にあれば削除してから保存し直す(月1回の実行でも、再実行しても
 * 重複が積み上がらないようにするため)。
 * @param {string} commodity
 * @param {number} price
 * @param {string} unit
 * @param {string} priceDate "YYYY-MM-DD"形式(その月の1日とする)
 */
export async function upsertOfficialPricePoint(commodity, price, unit, priceDate) {
  const supabase = getClient();
  const { error: deleteError } = await supabase
    .from("price_points")
    .delete()
    .is("item_id", null)
    .eq("commodity", commodity)
    .eq("price_date", priceDate);
  if (deleteError) throw new Error(`相場データの重複削除に失敗しました: ${deleteError.message}`);

  const { error: insertError } = await supabase
    .from("price_points")
    .insert({ item_id: null, commodity, price, unit, price_date: priceDate });
  if (insertError) throw new Error(`相場データの保存に失敗しました: ${insertError.message}`);
}

/**
 * 記事の閲覧回数を1増やす(「社内で注目されているニュース」ランキング用)。
 * 読み取り→更新のため、同時アクセスが重なった場合に1〜2件ずれる可能性はあるが、
 * アクセス規模を踏まえ許容する(reactions追記と同じ考え方)。
 * @param {string} itemId
 */
export async function incrementViewCount(itemId) {
  const supabase = getClient();
  const { data: row, error: readError } = await supabase
    .from("items")
    .select("view_count")
    .eq("id", itemId)
    .single();
  if (readError) throw new Error(`該当する記事が見つかりません: ${readError.message}`);

  const { error: writeError } = await supabase
    .from("items")
    .update({ view_count: (row.view_count ?? 0) + 1 })
    .eq("id", itemId);
  if (writeError) throw new Error(`閲覧回数の更新に失敗しました: ${writeError.message}`);
}

/**
 * サイト全体のページ閲覧ログを1件記録する(インプレッション分析レポート用)。
 */
export async function logPageView() {
  const supabase = getClient();
  const { error } = await supabase.from("page_views").insert({});
  if (error) throw new Error(`アクセスログの記録に失敗しました: ${error.message}`);
}

/**
 * 記事に対する「要る/要らない」反応を記録する。reactionsはjsonb配列カラムに追記する。
 * @param {string} itemId
 * @param {{ userId: string, judgement: "want" | "not_want" }} reaction
 */
export async function addReaction(itemId, reaction) {
  const supabase = getClient();
  const { data: row, error: readError } = await supabase
    .from("items")
    .select("reactions")
    .eq("id", itemId)
    .single();
  if (readError) throw new Error(`該当する記事が見つかりません: ${readError.message}`);

  const reactions = [...(row.reactions ?? []), { ...reaction, reactedAt: new Date().toISOString() }];
  const { error: writeError } = await supabase.from("items").update({ reactions }).eq("id", itemId);
  if (writeError) throw new Error(`反応の保存に失敗しました: ${writeError.message}`);
}

/**
 * 保存済みの全記事を取得する(フロントエンド表示用)。
 * DBのカラム名(snake_case)をアプリ内で使っている形(camelCase)に変換して返す。
 * @returns {Promise<Array<object>>}
 */
export async function listItems() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Supabaseからの取得に失敗しました: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    sourceUrl: row.source_url,
    sourceId: row.source_id,
    sourceName: row.source_name,
    isPrimarySource: row.is_primary_source,
    categories: row.categories,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
    reactions: row.reactions ?? [],
    isImportant: row.is_important ?? false,
    region: row.region ?? "全国・海外",
    sourceType: row.source_type ?? "企業",
    isPaywalled: row.is_paywalled ?? false,
    viewCount: row.view_count ?? 0
  }));
}
