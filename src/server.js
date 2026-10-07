import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addReaction, listItems } from "./lib/store.js";
import {
  submitFeedback,
  listFeedback,
  updateFeedback,
  deleteFeedback,
  addFeedbackReply,
  updateFeedbackReply,
  deleteFeedbackReply
} from "./lib/feedbackStore.js";
import { listAnalysisReports } from "./lib/analysisReportsStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(PUBLIC_DIR));

// フロントエンドが読みに行くAPI。store.jsが選んでいる保存先(Supabase/Firestore/ローカルファイル)を
// そのまま返すだけで、フロントエンド側はどの保存先かを意識しない。
app.get("/api/items", async (req, res) => {
  try {
    const items = await listItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(express.json());

// 記事に対する「要る/要らない」反応を記録するだけのAPI。
// 方針通り、この反応は表示中の一覧には即時反映しない(ルール改善の材料として蓄積するだけ)。
app.post("/api/items/:id/reaction", async (req, res) => {
  const { judgement, userId = "local-user" } = req.body ?? {};
  if (judgement !== "want" && judgement !== "not_want") {
    res.status(400).json({ error: "judgement must be 'want' or 'not_want'" });
    return;
  }
  try {
    await addReaction(req.params.id, { userId, judgement });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 使い勝手フィードバック(部署・名前・内容)の投稿を受け付けるAPI。
app.post("/api/feedback", async (req, res) => {
  const { department, name, content } = req.body ?? {};
  try {
    await submitFeedback({ department, name, content });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 投稿済みフィードバックを全員が見られるようにする一覧API。
app.get("/api/feedback", async (req, res) => {
  try {
    res.json(await listFeedback());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// フィードバック投稿そのものの編集。
app.patch("/api/feedback/:id", async (req, res) => {
  const { department, name, content } = req.body ?? {};
  try {
    await updateFeedback(req.params.id, { department, name, content });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// フィードバック投稿の削除(返信ごと削除)。
app.delete("/api/feedback/:id", async (req, res) => {
  try {
    await deleteFeedback(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// フィードバックへの返信。
app.post("/api/feedback/:id/reply", async (req, res) => {
  const { department, name, content } = req.body ?? {};
  try {
    await addFeedbackReply(req.params.id, { department, name, content });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 返信の編集。
app.patch("/api/feedback/:id/reply/:replyId", async (req, res) => {
  const { department, name, content } = req.body ?? {};
  try {
    await updateFeedbackReply(req.params.id, req.params.replyId, { department, name, content });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 返信の削除。
app.delete("/api/feedback/:id/reply/:replyId", async (req, res) => {
  try {
    await deleteFeedbackReply(req.params.id, req.params.replyId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 週次分析レポートの一覧(読み取り専用)。
app.get("/api/analysis-reports", async (req, res) => {
  try {
    res.json(await listAnalysisReports());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SKグループ情報フィードを起動しました: http://localhost:${PORT}`);
});
