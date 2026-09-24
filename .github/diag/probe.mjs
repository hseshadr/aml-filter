import dns from "node:dns";
import fs from "node:fs";
const url = process.argv[2] ?? "https://sanctionslist.fcdo.gov.uk/docs/UK-Sanctions-List.csv";
const host = new URL(url).hostname;
console.log("node", process.version, "undici", process.versions.undici, "openssl", process.versions.openssl);
try { console.log("resolv.conf:", fs.readFileSync("/etc/resolv.conf", "utf8").replace(/\n/g, " | ")); } catch {}
const chain = (e) => { const out = []; for (let c = e; c; c = c.cause) out.push({ name: c.name, code: c.code, message: c.message }); return JSON.stringify(out); };
for (const o of [{ all: true }, { all: true, family: 4 }, { all: true, family: 6 }]) {
  const s = Date.now();
  try { const a = await dns.promises.lookup(host, o); console.log("lookup", JSON.stringify(o), "ok", Date.now() - s, "ms", a.map((x) => x.address).join(",")); }
  catch (e) { console.log("lookup", JSON.stringify(o), "FAIL", Date.now() - s, "ms", e.code); }
}
for (const t of ["resolve4", "resolve6"]) { const s = Date.now(); try { const a = await dns.promises[t](host); console.log(t, "ok", Date.now() - s, a.join(",")); } catch (e) { console.log(t, "FAIL", Date.now() - s, e.code); } }
for (let i = 1; i <= 3; i++) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": "aml-filter/4 (+https://aml-filter.com)", accept: "*/*" } });
    let n = 0; for await (const c of r.body) n += c.length;
    console.log(`fetch#${i} status`, r.status, "bytes", n, "ms", Date.now() - t0, "server", r.headers.get("server"), "x-cache", r.headers.get("x-cache"));
  } catch (e) { console.log(`fetch#${i} FAIL ms`, Date.now() - t0, chain(e)); }
}
