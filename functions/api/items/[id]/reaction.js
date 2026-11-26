import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/items/:id/reaction — 記事に対する「参考になった」反応を記録する。
 * かつては「要る/要らない」の2択だったが、必要な情報は人によって違い「要らない」の
 * 判定が難しいという声があったため、「参考になった」1つだけに変更した
 * (過去データの"want"は引き続き「参考になった」として集計対象に含める)。
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
  if (judgement !== "useful") {
    return jsonResponse({ error: "judgement は 'useful' である必要があります" }, 400);
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
