import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

async function getFeedbackRow(feedbackId) {
  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("feedback").select("replies").eq("id", feedbackId).single();
    if (error) throw error;
    return data;
  }
  const list = await readLocalFeedback();
  const target = list.find((item) => item.id === feedbackId);
  if (!target) throw new Error("対象のフィードバックが見つかりません。");
  return target;
}

/**
 * 使い勝手フィードバック(部署・名前・内容)を保存する。
 * itemsと同じくSupabase設定があればSupabase、無ければローカルファイルに保存する。
 * @param {{ department: string, name: string, content: string }} input
 */
export async function submitFeedback({ department, name, content }) {
  if (!department || !department.trim()) throw new Error("部署は必須です。");
  if (!name || !name.trim()) throw new Error("名前は必須です。");
  if (!content || !content.trim()) throw new Error("内容は必須です。");

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { error } = await supabase.from("feedback").insert({
      department: department.trim(),
      name: name.trim(),
      content: content.trim()
    });
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  list.push({
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    department: department.trim(),
    name: name.trim(),
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
 * フィードバック投稿そのものを編集する(部署・名前・内容)。
 * @param {string} feedbackId
 * @param {{ department: string, name: string, content: string }} input
 */
export async function updateFeedback(feedbackId, { department, name, content }) {
  if (!department || !department.trim()) throw new Error("部署は必須です。");
  if (!name || !name.trim()) throw new Error("名前は必須です。");
  if (!content || !content.trim()) throw new Error("内容は必須です。");
  const patch = { department: department.trim(), name: name.trim(), content: content.trim() };

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { error } = await supabase.from("feedback").update(patch).eq("id", feedbackId);
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  const target = list.find((item) => item.id === feedbackId);
  if (!target) throw new Error("対象のフィードバックが見つかりません。");
  Object.assign(target, patch);
  await writeLocalFeedback(list);
}

/**
 * フィードバック投稿を削除する(返信ごと削除される)。
 * @param {string} feedbackId
 */
export async function deleteFeedback(feedbackId) {
  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const { error } = await supabase.from("feedback").delete().eq("id", feedbackId);
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  await writeLocalFeedback(list.filter((item) => item.id !== feedbackId));
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
    id: randomUUID(),
    department: department || null,
    name: name || null,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const row = await getFeedbackRow(feedbackId);
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

/**
 * 返信を編集する。
 * @param {string} feedbackId
 * @param {string} replyId
 * @param {{ department: string, name: string, content: string }} input
 */
export async function updateFeedbackReply(feedbackId, replyId, { department, name, content }) {
  if (!content || !content.trim()) {
    throw new Error("返信内容は必須です。");
  }

  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const row = await getFeedbackRow(feedbackId);
    const replies = (row.replies ?? []).map((r) =>
      r.id === replyId ? { ...r, department: department || null, name: name || null, content: content.trim() } : r
    );
    const { error } = await supabase.from("feedback").update({ replies }).eq("id", feedbackId);
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  const target = list.find((item) => item.id === feedbackId);
  if (!target) throw new Error("対象のフィードバックが見つかりません。");
  target.replies = (target.replies ?? []).map((r) =>
    r.id === replyId ? { ...r, department: department || null, name: name || null, content: content.trim() } : r
  );
  await writeLocalFeedback(list);
}

/**
 * 返信を削除する。
 * @param {string} feedbackId
 * @param {string} replyId
 */
export async function deleteFeedbackReply(feedbackId, replyId) {
  if (process.env.SUPABASE_URL) {
    const supabase = getSupabase();
    const row = await getFeedbackRow(feedbackId);
    const replies = (row.replies ?? []).filter((r) => r.id !== replyId);
    const { error } = await supabase.from("feedback").update({ replies }).eq("id", feedbackId);
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  const target = list.find((item) => item.id === feedbackId);
  if (!target) throw new Error("対象のフィードバックが見つかりません。");
  target.replies = (target.replies ?? []).filter((r) => r.id !== replyId);
  await writeLocalFeedback(list);
}
