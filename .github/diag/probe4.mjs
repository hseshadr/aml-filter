// Same probe, but through the fix: an undici Agent resolving IPv4-only.
import dns from "node:dns";
import { Agent } from "undici";
const url = process.argv[2];
const dispatcher = new Agent({ connect: { lookup: (h, o, cb) => dns.lookup(h, { ...o, family: 4 }, cb) } });
const chain = (e) => { const out = []; for (let c = e; c; c = c.cause) out.push({ code: c.code, message: c.message }); return JSON.stringify(out); };
for (let i = 1; i <= 5; i++) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { dispatcher, headers: { "user-agent": "aml-filter/4 (+https://aml-filter.com)" } });
    let n = 0; for await (const c of r.body) n += c.length;
    console.log(`ipv4-fix fetch#${i} status`, r.status, "bytes", n, "ms", Date.now() - t0);
  } catch (e) { console.log(`ipv4-fix fetch#${i} FAIL ms`, Date.now() - t0, chain(e)); }
}
