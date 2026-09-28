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
      collected_at: new Date().toISOString()
    })
    .select("id")
    .single();
  if (error) throw new Error(`Supabaseへの保存に失敗しました: ${error.message}`);
  return data.id;
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
    reactions: row.reactions ?? []
  }));
}
