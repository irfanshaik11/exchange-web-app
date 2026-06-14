#!/usr/bin/env node
// Backfill KOL avatars via Twitter's public syndication endpoint (the embed-
// widget API — no auth, no rate limit). For each handle, fetch the
// timeline-profile page, parse __NEXT_DATA__, find the user whose screen_name
// EXACTLY matches the requested handle, and download its profile_image_url_https
// upscaled to _400x400. Only saves on an exact screen_name match -> never the
// wrong person's face. Writes public/kol-avatars/{handle}.jpg. Idempotent.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "kol-avatars");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
const DELAY = Number(process.env.DELAY) || 600;
const LIST = process.env.LIST || "/tmp/missing_handles.txt";
const handles = fs
  .readFileSync(LIST, "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

function upscale(url) {
  return url.replace(/_(normal|bigger|mini|200x200|x96)\.(jpg|jpeg|png|webp)/i, "_400x400.$2");
}

function findAvatar(nextData, handle) {
  let hit = null;
  const target = handle.toLowerCase();
  const walk = (o) => {
    if (!o || typeof o !== "object" || hit) return;
    if (
      typeof o.screen_name === "string" &&
      o.screen_name.toLowerCase() === target &&
      typeof o.profile_image_url_https === "string"
    ) {
      hit = o.profile_image_url_https;
      return;
    }
    for (const k in o) walk(o[k]);
  };
  walk(nextData);
  return hit;
}

let saved = 0,
  noMatch = 0,
  errored = 0;
for (let i = 0; i < handles.length; i++) {
  const h = handles[i];
  const out = path.join(DIR, `${h}.jpg`);
  if (fs.existsSync(out)) continue;
  try {
    // 429-resilient fetch: syndication rate-limits bursts. On 429, wait long
    // and retry so we eventually clear the window.
    let html = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(
        `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(h)}`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) },
      );
      html = await res.text();
      if (res.status !== 429 && !html.startsWith("Rate limit")) break;
      const wait = 30000 + attempt * 20000; // 30s,50s,70s,...
      process.stdout.write(`[${i + 1}/${handles.length}] ${h}: rate-limited, wait ${wait / 1000}s\n`);
      await new Promise((r) => setTimeout(r, wait));
    }
    const m = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    let avatar = null;
    if (m) {
      try {
        avatar = findAvatar(JSON.parse(m[1]), h);
      } catch {}
    }
    if (!avatar) {
      noMatch++;
      process.stdout.write(`[${i + 1}/${handles.length}] ${h}: no match\n`);
    } else {
      const imgUrl = upscale(avatar);
      const ir = await fetch(imgUrl, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      const ct = ir.headers.get("content-type") || "";
      if (ir.ok && ct.startsWith("image")) {
        const buf = Buffer.from(await ir.arrayBuffer());
        if (buf.length > 500) {
          fs.writeFileSync(out, buf);
          saved++;
          process.stdout.write(`[${i + 1}/${handles.length}] ${h}: saved ${buf.length}b\n`);
        } else noMatch++;
      } else {
        // try original (non-upscaled) as fallback
        const ir2 = await fetch(avatar, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
        if (ir2.ok && (ir2.headers.get("content-type") || "").startsWith("image")) {
          fs.writeFileSync(out, Buffer.from(await ir2.arrayBuffer()));
          saved++;
          process.stdout.write(`[${i + 1}/${handles.length}] ${h}: saved (orig res)\n`);
        } else {
          errored++;
        }
      }
    }
  } catch (e) {
    errored++;
    process.stdout.write(`[${i + 1}/${handles.length}] ${h}: ERR ${e.message}\n`);
  }
  await new Promise((r) => setTimeout(r, DELAY));
}
console.log(`\nDONE: saved=${saved} no-match=${noMatch} errored=${errored}`);
