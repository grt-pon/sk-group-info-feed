import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/price-points — 品目別の相場推移データを返す(グラフ描画用)。
 * 記事本体(items)は1ヶ月で自動削除されるが、price_pointsは独立して長期保存している。
 */
export async function onRequestGet(context) {
  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("price_points")
    .select("id, item_id, commodity, price, unit, price_date, created_at")
    .order("price_date", { ascending: true });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const points = (data ?? []).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    commodity: row.commodity,
    price: row.price,
    unit: row.unit,
    priceDate: row.price_date,
    createdAt: row.created_at
  }));

  return jsonResponse(points);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
