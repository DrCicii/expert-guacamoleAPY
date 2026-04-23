import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = process.cwd();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

function safePath(urlPath) {
  const clean = urlPath.split("?")[0].split("#")[0];
  if (clean.includes("..")) return null;
  if (clean === "/" || clean === "") return join(ROOT, "index.html");
  return join(ROOT, clean.replace(/^\//, ""));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const server = createServer((req, res) => {
  (async () => {
    try {
      const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
      if (reqUrl.pathname === "/api/telegram/notify") {
        if (req.method !== "POST") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
          sendJson(res, 500, {
            ok: false,
            error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables",
          });
          return;
        }
        const body = await readJsonBody(req);
        const text = String(body?.text ?? "").trim();
        if (!text) {
          sendJson(res, 400, { ok: false, error: "Missing text" });
          return;
        }

        const tgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
          }),
        });
        const tgJson = await tgRes.json().catch(() => ({}));
        if (!tgRes.ok || tgJson?.ok === false) {
          sendJson(res, 502, {
            ok: false,
            error: "Telegram API rejected the request",
            details: tgJson,
          });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      const filePath = safePath(reqUrl.pathname);
      if (!filePath) {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }
      if (!existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const ext = extname(filePath).toLowerCase();
      const type = MIME[ext] ?? "application/octet-stream";
      const fileBody = readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
      });
      res.end(fileBody);
    } catch (e) {
      res.writeHead(500);
      res.end(`Server error: ${e?.message ?? String(e)}`);
    }
  })();
});

server.listen(PORT, () => {
  console.log(`DeFi APY Tracker running on http://localhost:${PORT}`);
});

