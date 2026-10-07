import { createClient } from "@supabase/supabase-js";

/**
 * PATCH /api/feedback/:id/reply/:replyId — 返信を編集する。
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
  if (!content || !content.trim()) {
    return jsonResponse({ error: "返信内容は必須です。" }, 400);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error: readError } = await supabase
    .from("feedback")
    .select("replies")
    .eq("id", params.id)
    .single();
  if (readError) {
    return jsonResponse({ error: readError.message }, 404);
  }

  const replies = (row.replies ?? []).map((r) =>
    r.id === params.replyId ? { ...r, department: department || null, name: name || null, content: content.trim() } : r
  );
  const { error: writeError } = await supabase.from("feedback").update({ replies }).eq("id", params.id);
  if (writeError) {
    return jsonResponse({ error: writeError.message }, 500);
  }
  return jsonResponse({ ok: true });
}

/**
 * DELETE /api/feedback/:id/reply/:replyId — 返信を削除する。
 */
export async function onRequestDelete(context) {
  const { env, params } = context;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error: readError } = await supabase
    .from("feedback")
    .select("replies")
    .eq("id", params.id)
    .single();
  if (readError) {
    return jsonResponse({ error: readError.message }, 404);
  }

  const replies = (row.replies ?? []).filter((r) => r.id !== params.replyId);
  const { error: writeError } = await supabase.from("feedback").update({ replies }).eq("id", params.id);
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
