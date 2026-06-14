#!/usr/bin/env node
// Backfill KOL avatars from kolscan's CDN, keyed by WALLET ADDRESS:
//   https://cdn.kolscan.io/profiles/{address}.png
// This needs no twitter handle (we have every address), isn't twitter-rate-
// limited (it's a CDN), and covers exactly the KOLs kolscan tracks. Saves to
// public/kol-avatars/{address}.png. Idempotent; skips existing + 404s.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "kol-avatars");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// every unique KOL address (kolWallets + tracker)
const kw = JSON.parse(fs.readFileSync("src/data/kolWallets.json", "utf8"));
const tr = JSON.parse(fs.readFileSync("src/data/kol-wallet-tracker.json", "utf8"));
const addrs = [
  ...new Set([
    ...kw.map((e) => e.address).filter(Boolean),
    ...tr.map((t) => t.wallet).filter(Boolean),
  ]),
];

let saved = 0,
  missing = 0,
  errored = 0;
for (let i = 0; i < addrs.length; i++) {
  const a = addrs[i];
  const out = path.join(DIR, `${a}.png`);
  if (fs.existsSync(out)) continue;
  try {
    const res = await fetch(`https://cdn.kolscan.io/profiles/${a}.png`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.startsWith("image")) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 300) {
        fs.writeFileSync(out, buf);
        saved++;
        if (saved % 20 === 0)
          process.stdout.write(`[${i + 1}/${addrs.length}] saved=${saved}\n`);
      } else missing++;
    } else if (res.status === 404) {
      missing++;
    } else {
      errored++;
      process.stdout.write(`[${i + 1}/${addrs.length}] ${a.slice(0, 6)} HTTP ${res.status}\n`);
    }
  } catch (e) {
    errored++;
  }
  await new Promise((r) => setTimeout(r, 150));
}
console.log(`\nDONE: saved=${saved} no-avatar(404)=${missing} errored=${errored} / total=${addrs.length}`);
