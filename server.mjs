import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 5173);
const ROOT = process.cwd();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const RWA_ONYC_URL = "https://app.rwa.xyz/assets/ONyc";

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

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPercentAfterLabel(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*([0-9]+(?:\\.[0-9]+)?)%`, "i"));
  return match ? Number(match[1]) : NaN;
}

function extractPercentFromHtml(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`${escaped}[\\s\\S]{0,120}?([0-9]+(?:\\.[0-9]+)?)%`, "i"),
    new RegExp(`>${escaped}<[^%]{0,200}?([0-9]+(?:\\.[0-9]+)?)%`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match) return Number(match[1]);
  }
  return NaN;
}

async function fetchRwaOnycApy() {
  const rwaRes = await fetch(RWA_ONYC_URL, {
    headers: {
      "User-Agent": "DeFi APY Tracker/1.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!rwaRes.ok) {
    throw new Error(`RWA.xyz request failed with HTTP ${rwaRes.status}`);
  }

  const html = await rwaRes.text();
  const text = stripHtml(html);
  const apy7dPct =
    extractPercentAfterLabel(text, "7D APY") ||
    extractPercentFromHtml(html, "7D APY");
  const apy30dPct =
    extractPercentAfterLabel(text, "30D APY") ||
    extractPercentFromHtml(html, "30D APY");

  if (!Number.isFinite(apy7dPct) && !Number.isFinite(apy30dPct)) {
    throw new Error("Could not parse ONyc APY from RWA.xyz");
  }

  return {
    ok: true,
    symbol: "ONyc",
    protocol: "RWA.xyz",
    chain: "Solana",
    pool: "OnRe Tokenized Reinsurance",
    apyPct: Number.isFinite(apy7dPct) ? apy7dPct : apy30dPct,
    apyWindow: Number.isFinite(apy7dPct) ? "7D" : "30D",
    apy7dPct: Number.isFinite(apy7dPct) ? apy7dPct : null,
    apy30dPct: Number.isFinite(apy30dPct) ? apy30dPct : null,
    sourceUrl: RWA_ONYC_URL,
  };
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

      if (reqUrl.pathname === "/api/rwa/onyc-apy") {
        if (req.method !== "GET") {
          sendJson(res, 405, { ok: false, error: "Method not allowed" });
          return;
        }
        try {
          const payload = await fetchRwaOnycApy();
          sendJson(res, 200, payload);
        } catch (e) {
          sendJson(res, 502, {
            ok: false,
            error: e?.message ?? "Failed to fetch ONyc APY from RWA.xyz",
          });
        }
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

