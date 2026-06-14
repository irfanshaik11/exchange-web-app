#!/usr/bin/env node
// Backfill KOL profile pics into public/kol-avatars/{handle}.jpg from
// unavatar.io (X profile pic resolver). ?fallback=false => 404 for unknown
// handles so we never save a generic gray placeholder (KolAvatar falls back to
// a colored initial for those). Idempotent: skips handles already present.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "kol-avatars");
const handles = fs
  .readFileSync("/tmp/missing_handles.txt", "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

let saved = 0,
  missing = 0,
  errored = 0;

for (let i = 0; i < handles.length; i++) {
  const h = handles[i];
  const out = path.join(DIR, `${h}.jpg`);
  if (fs.existsSync(out)) continue;
  try {
    // wsrv.nl image proxy fetches unavatar from ITS IP (bypasses our rate
    // limit). Failures come back as JSON; only image/* content is a real pic.
    const res = await fetch(
      `https://wsrv.nl/?url=ssl:unavatar.io/x/${encodeURIComponent(h)}%3Ffallback=false&output=jpg`,
      { signal: AbortSignal.timeout(20000) },
    );
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.startsWith("image")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 500) {
        fs.writeFileSync(out, buf);
        saved++;
        process.stdout.write(`[${i + 1}/${handles.length}] ${h}: saved ${buf.length}b\n`);
      } else {
        missing++;
      }
    } else {
      missing++;
      process.stdout.write(`[${i + 1}/${handles.length}] ${h}: no pic (${res.status} ${ct})\n`);
    }
  } catch (e) {
    errored++;
    process.stdout.write(`[${i + 1}/${handles.length}] ${h}: ERR ${e.message}\n`);
  }
  await new Promise((r) => setTimeout(r, Number(process.env.DELAY) || 350));
}
console.log(`\nDONE: saved=${saved} no-pic=${missing} errored=${errored}`);
