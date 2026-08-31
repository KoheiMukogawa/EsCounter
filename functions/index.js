const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();

// ── 設定 ───────────────────────────────────────────────
// 許可オリジン（本番＝GitHub Pages ＋ ローカル検証用）。必要ならポートを足す。
const ALLOWED_ORIGINS = new Set([
  "https://koheimukogawa.github.io",
  "http://localhost:8000",
  "http://localhost:5500",
]);

// 許可UIDリストは Secret Manager の ALLOWED_UIDS に「カンマ区切りUID文字列」として保存する
// （下の secrets: [...] 経由で process.env.ALLOWED_UIDS に注入される）。
// UID自体は署名付きIDトークンなしには認証に使えないので秘密情報ではないが、
// 既に秘密情報の受け渡しに使っている Secret Manager と運用経路を一本化するために採用した。

const MODEL = "claude-opus-4-8";
const MAX_TOKENS_CAP = 8000;

// ── Claude プロキシ（全AI機能の共通入口）──────────────────
// 将来は req.body.intent で refine / generate / interview / scout に分岐させる。
exports.ai = onRequest(
  {
    secrets: ["ANTHROPIC_API_KEY", "ALLOWED_UIDS"],
    region: "asia-northeast1",
    timeoutSeconds: 300,
    maxInstances: 5,
  },
  async (req, res) => {
    // --- CORS ---
    const origin = req.headers.origin || "";
    if (ALLOWED_ORIGINS.has(origin)) res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // --- 本人確認（Firebase IDトークン）---
    const match = (req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!match) return res.status(401).json({ error: "missing token" });
    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(match[1])).uid;
    } catch (e) {
      return res.status(401).json({ error: "invalid token" });
    }
    // fail-closed: allowlist が空（未設定・カンマ区切りの解析結果が空・読み込み失敗）なら
    // 誰であっても拒否する。「設定漏れ→誰でも通る」ではなく「設定漏れ→誰も通らない」側に倒す。
    let allowedUids;
    try {
      allowedUids = new Set(
        (process.env.ALLOWED_UIDS || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } catch (e) {
      allowedUids = new Set();
    }
    if (allowedUids.size === 0 || !allowedUids.has(uid)) {
      return res.status(403).json({ error: "not allowed" });
    }

    // --- 入力 ---
    const { system, messages, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages (array) required" });
    }
    const maxTokens = Math.min(Number(max_tokens) || 4000, MAX_TOKENS_CAP);

    // --- Claude へストリーミング → SSE で中継 ---
    res.set("Content-Type", "text/event-stream; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-transform");
    res.set("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    try {
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages,
      });
      stream.on("text", (delta) => {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      });
      const final = await stream.finalMessage();
      res.write(`data: ${JSON.stringify({ done: true, usage: final.usage })}\n\n`);
      res.end();
    } catch (e) {
      console.error("Claude error:", e);
      res.write(`data: ${JSON.stringify({ error: e.message || String(e) })}\n\n`);
      res.end();
    }
  }
);
