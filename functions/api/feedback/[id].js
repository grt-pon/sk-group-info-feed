import { createClient } from "@supabase/supabase-js";

/**
 * PATCH /api/feedback/:id — フィードバック投稿そのものを編集する(部署・名前・内容)。
 */
export async function onRequestPatch(context) {
  const { env, params, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "リクエストボディがJSONとして解釈できません" }, 400);
  }

  const { department, name, content } = body ?? {};
  if (!department || !department.trim()) return jsonResponse({ error: "部署は必須です。" }, 400);
  if (!name || !name.trim()) return jsonResponse({ error: "名前は必須です。" }, 400);
  if (!content || !content.trim()) return jsonResponse({ error: "内容は必須です。" }, 400);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("feedback")
    .update({ department: department.trim(), name: name.trim(), content: content.trim() })
    .eq("id", params.id);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({ ok: true });
}

/**
 * DELETE /api/feedback/:id — フィードバック投稿を削除する(返信ごと削除される)。
 */
export async function onRequestDelete(context) {
  const { env, params } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("feedback").delete().eq("id", params.id);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }
  return jsonResponse({ ok: true });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
