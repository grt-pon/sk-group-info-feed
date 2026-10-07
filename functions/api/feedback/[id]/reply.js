import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/feedback/:id/reply — フィードバックへの返信を追加する。
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

  const { department, name, content } = body ?? {};
  if (!content || !content.trim()) {
    return jsonResponse({ error: "返信内容は必須です。" }, 400);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: readError } = await supabase.from("feedback").select("replies").eq("id", id).single();
  if (readError) {
    return jsonResponse({ error: readError.message }, 404);
  }

  const reply = {
    id: crypto.randomUUID(),
    department: department || null,
    name: name || null,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };
  const replies = [...(row.replies ?? []), reply];
  const { error: writeError } = await supabase.from("feedback").update({ replies }).eq("id", id);
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
