#!/usr/bin/env node
// LexGo MD bot — whoever presses /start gets the finished briefs as .md files,
// each with the project name and a line saying what is inside it.
//
// Run:   node tools/mdbot/bot.mjs            (long polling, stays up)
//        node tools/mdbot/bot.mjs --once     (answer what is pending, then exit)
//        node tools/mdbot/bot.mjs --broadcast (push the docs to everyone who
//                                             has ever pressed /start)
//
// The token is read from tools/mdbot/.env (TELEGRAM_BOT_TOKEN=…) or from the
// environment. It is never written into this file: a bot token is a password,
// and this directory is in version control.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, ".env");
const DOCS_FILE = path.join(HERE, "docs.json");
const SUBS_FILE = path.join(HERE, "subscribers.json");
const OFFSET_FILE = path.join(HERE, ".offset");

// ── token ──────────────────────────────────────────────────────────
function readToken() {
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN.trim();
  if (fs.existsSync(ENV_FILE)) {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  console.error("TELEGRAM_BOT_TOKEN topilmadi. tools/mdbot/.env faylini yarating.");
  process.exit(1);
}
const TOKEN = readToken();
const API = `https://api.telegram.org/bot${TOKEN}`;

// ── tiny json store ────────────────────────────────────────────────
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// ── telegram ───────────────────────────────────────────────────────
async function call(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

async function sendMessage(chatId, text) {
  return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
}

// Telegram captions cap at 1024 characters; a description longer than that is
// cut on a word boundary rather than mid-sentence.
function caption(text) {
  if (text.length <= 1024) return text;
  return text.slice(0, 1020).replace(/\s+\S*$/, "") + "…";
}

async function sendDoc(chatId, filePath, text) {
  const form = new FormData();
  form.set("chat_id", String(chatId));
  form.set("caption", caption(text));
  form.set("parse_mode", "HTML");
  form.set("document", new Blob([fs.readFileSync(filePath)], { type: "text/markdown" }), path.basename(filePath));
  const res = await fetch(`${API}/sendDocument`, { method: "POST", body: form });
  const json = await res.json();
  if (!json.ok) throw new Error(`sendDocument ${path.basename(filePath)}: ${json.description}`);
  return json.result;
}

// ── the payload ────────────────────────────────────────────────────
function loadDocs() {
  const cfg = readJson(DOCS_FILE, null);
  if (!cfg) throw new Error("docs.json o'qib bo'lmadi");
  const docs = cfg.docs
    .map((d) => ({ ...d, abs: path.resolve(HERE, d.file) }))
    .filter((d) => {
      if (fs.existsSync(d.abs)) return true;
      console.warn(`[skip] topilmadi: ${d.file}`);
      return false;
    });
  return { project: cfg.project, tagline: cfg.tagline, docs };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function deliver(chatId) {
  const { project, tagline, docs } = loadDocs();
  if (!docs.length) {
    await sendMessage(chatId, "Hozircha yuboradigan hujjat yo'q.");
    return;
  }
  await sendMessage(
    chatId,
    `<b>${esc(project)}</b> — ${esc(tagline)}\n\n` +
      `Quyida ${docs.length} ta tayyor hujjat. Har birining ostida nima haqida ekani yozilgan.`,
  );
  for (const d of docs) {
    const kb = Math.max(1, Math.round(fs.statSync(d.abs).size / 1024));
    await sendDoc(
      chatId,
      d.abs,
      `<b>${esc(project)} — ${esc(d.title)}</b>\n\n${esc(d.description)}\n\n<i>${esc(path.basename(d.abs))} · ${kb} KB</i>`,
    );
  }
}

// ── update handling ────────────────────────────────────────────────
function remember(chat) {
  const subs = readJson(SUBS_FILE, {});
  const id = String(chat.id);
  subs[id] = {
    id: chat.id,
    name: [chat.first_name, chat.last_name].filter(Boolean).join(" "),
    username: chat.username || "",
    firstSeen: subs[id]?.firstSeen || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };
  writeJson(SUBS_FILE, subs);
}

const HELP =
  "<b>Buyruqlar</b>\n" +
  "/start — tayyor hujjatlarni olish\n" +
  "/docs — hujjatlarni qayta yuborish\n" +
  "/help — shu yordam";

async function handle(update) {
  const msg = update.message || update.channel_post;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  remember(msg.chat);

  if (/^\/(start|docs)\b/i.test(text)) {
    await deliver(chatId);
    return;
  }
  if (/^\/help\b/i.test(text)) {
    await sendMessage(chatId, HELP);
    return;
  }
  await sendMessage(chatId, `Hujjatlarni olish uchun /start bosing.\n\n${HELP}`);
}

// ── runners ────────────────────────────────────────────────────────
async function poll({ once }) {
  let offset = Number(readJson(OFFSET_FILE, { offset: 0 }).offset) || 0;
  console.log(`[mdbot] ishga tushdi${once ? " (--once)" : ""}, offset=${offset}`);
  for (;;) {
    let updates = [];
    try {
      updates = await call("getUpdates", { offset, timeout: once ? 0 : 50, allowed_updates: ["message"] });
    } catch (e) {
      console.error("[mdbot] getUpdates:", e.message);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    for (const u of updates) {
      offset = u.update_id + 1;
      try { await handle(u); } catch (e) { console.error("[mdbot] handle:", e.message); }
    }
    if (updates.length) writeJson(OFFSET_FILE, { offset });
    if (once) return;
  }
}

async function broadcast() {
  const subs = Object.values(readJson(SUBS_FILE, {}));
  if (!subs.length) {
    console.log("[mdbot] hali hech kim /start bosmagan.");
    return;
  }
  for (const s of subs) {
    try {
      await deliver(s.id);
      console.log(`[mdbot] yuborildi → ${s.name || s.id}`);
    } catch (e) {
      console.error(`[mdbot] ${s.id}:`, e.message);
    }
  }
}

const argv = process.argv.slice(2);
(argv.includes("--broadcast") ? broadcast() : poll({ once: argv.includes("--once") })).catch((e) => {
  console.error("[mdbot]", e.message);
  process.exit(1);
});
