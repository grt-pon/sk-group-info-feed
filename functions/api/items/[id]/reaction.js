import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/items/:id/reaction — 記事に対する「要る/要らない」反応を記録する。
 * 方針通り、この反応は一覧の表示には即時反映しない(蓄積してルール改善の材料にのみ使う想定)。
 */
export async function onRequestPost(context) {
  const { env, params, request } = context;
  const id = params.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "リクエストボディがJSONとして解釈できません" }, 400);
  }

  const { judgement, userId = "web-user" } = body ?? {};
  if (judgement !== "want" && judgement !== "not_want") {
    return jsonResponse({ error: "judgement は 'want' か 'not_want' である必要があります" }, 400);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: readError } = await supabase.from("items").select("reactions").eq("id", id).single();
  if (readError) {
    return jsonResponse({ error: readError.message }, 404);
  }

  const reactions = [...(row.reactions ?? []), { userId, judgement, reactedAt: new Date().toISOString() }];
  const { error: writeError } = await supabase.from("items").update({ reactions }).eq("id", id);
  if (writeError) {
    return jsonResponse({ error: writeError.message }, 500);
  }

  return jsonResponse({ ok: true });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
