import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LOCAL_FILE = path.resolve("data/feedback.json");

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function readLocalFeedback() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeLocalFeedback(list) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(list, null, 2), "utf8");
}

/**
 * 使い勝手フィードバック(部署・名前・内容)を保存する。
 * itemsと同じくSupabase設定があればSupabase、無ければローカルファイルに保存する。
 * @param {{ department: string, name: string, content: string }} input
 */
export async function submitFeedback({ department, name, content }) {
  if (!content || !content.trim()) {
    throw new Error("内容は必須です。");
  }

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { error } = await supabase.from("feedback").insert({
      department: department || null,
      name: name || null,
      content: content.trim()
    });
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  list.push({
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    department: department || null,
    name: name || null,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    replies: []
  });
  await writeLocalFeedback(list);
}

/**
 * 投稿済みのフィードバックを全員が見られるよう一覧で返す(新しい順)。
 * @returns {Promise<Array<{ id: string, department: string|null, name: string|null, content: string, createdAt: string, replies: Array }>>}
 */
export async function listFeedback() {
  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      department: row.department,
      name: row.name,
      content: row.content,
      createdAt: row.created_at,
      replies: row.replies ?? []
    }));
  }

  const list = await readLocalFeedback();
  return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 返信用の合言葉(簡易パスワード)が一致するかを確認する。
 * 本格的なログインではなく、FEEDBACK_REPLY_PASSWORD環境変数と一致するかだけを見る簡易的な歯止め。
 * @param {string} password
 * @returns {boolean}
 */
export function verifyReplyPassword(password) {
  const expected = process.env.FEEDBACK_REPLY_PASSWORD;
  return Boolean(expected) && password === expected;
}

/**
 * フィードバックに対する返信を追加する。
 * @param {string} feedbackId
 * @param {{ department: string, name: string, content: string }} reply
 */
export async function addFeedbackReply(feedbackId, { department, name, content }) {
  if (!content || !content.trim()) {
    throw new Error("返信内容は必須です。");
  }
  const reply = {
    department: department || null,
    name: name || null,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { data: row, error: readError } = await supabase
      .from("feedback")
      .select("replies")
      .eq("id", feedbackId)
      .single();
    if (readError) throw readError;

    const replies = [...(row.replies ?? []), reply];
    const { error: writeError } = await supabase.from("feedback").update({ replies }).eq("id", feedbackId);
    if (writeError) throw writeError;
    return;
  }

  const list = await readLocalFeedback();
  const target = list.find((item) => item.id === feedbackId);
  if (!target) throw new Error("対象のフィードバックが見つかりません。");
  target.replies = [...(target.replies ?? []), reply];
  await writeLocalFeedback(list);
}
