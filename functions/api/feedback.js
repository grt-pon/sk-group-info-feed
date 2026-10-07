import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/feedback — 使い勝手フィードバック(部署・名前・内容)を保存する。
 */
export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "リクエストボディがJSONとして解釈できません" }, 400);
  }

  const { department, name, content } = body ?? {};
  if (!content || !content.trim()) {
    return jsonResponse({ error: "内容は必須です。" }, 400);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("feedback").insert({
    department: department || null,
    name: name || null,
    content: content.trim()
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true });
}

/**
 * GET /api/feedback — 投稿済みフィードバックを全員が見られるよう一覧で返す(新しい順)。
 */
export async function onRequestGet(context) {
  const { env } = context;
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false });
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const items = (data ?? []).map((row) => ({
    id: row.id,
    department: row.department,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    replies: row.replies ?? []
  }));

  return jsonResponse(items);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
