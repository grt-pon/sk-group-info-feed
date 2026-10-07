import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const LOCAL_FILE = path.resolve("data/feedback.json");

async function readLocalFeedback() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
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
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("feedback").insert({
      department: department || null,
      name: name || null,
      content: content.trim()
    });
    if (error) throw error;
    return;
  }

  const list = await readLocalFeedback();
  list.push({ department: department || null, name: name || null, content: content.trim(), createdAt: new Date().toISOString() });
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(list, null, 2), "utf8");
}
