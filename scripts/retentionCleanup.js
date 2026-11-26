import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// 記事の保存期間を1ヶ月とし、収集から1ヶ月を超えた記事を日次で自動削除する。
// 「読みたい記事はブックマークしておいてください」という案内を使い方ページに出している前提の仕組み。
// price_points(品目別相場の推移データ)はitemsとは独立したテーブルなので、ここでは削除しない
// (記事が消えても相場の推移グラフ自体は長期で見られるようにするため)。
// page_viewsはアクセス解析用の軽量なログで無限に増え続けると重くなるため、1年より古い分だけ間引く。
const ITEM_RETENTION_DAYS = 30;
const PAGE_VIEW_RETENTION_DAYS = 365;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const itemCutoff = new Date(Date.now() - ITEM_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: toDelete, error: selectError } = await supabase
    .from("items")
    .select("id, title, collected_at")
    .lt("collected_at", itemCutoff);
  if (selectError) throw selectError;

  console.log(`記事の削除対象(収集から${ITEM_RETENTION_DAYS}日超): ${toDelete.length}件`);
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from("items").delete().lt("collected_at", itemCutoff);
    if (deleteError) throw deleteError;
    console.log("記事を削除しました。");
  }

  const pageViewCutoff = new Date(Date.now() - PAGE_VIEW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: pageViewError } = await supabase.from("page_views").delete().lt("viewed_at", pageViewCutoff);
  if (pageViewError) throw pageViewError;
  console.log(`page_viewsの${PAGE_VIEW_RETENTION_DAYS}日超のログを削除しました。`);
}

main();
