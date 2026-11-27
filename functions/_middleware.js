const TRANG_BAO_VE = (p) => p === "/" || p === "/index.html" || p.startsWith("/api/");

async function bam(s) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bangNhau(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function docCookie(request, ten) {
  const c = request.headers.get("cookie") || "";
  for (const p of c.split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k === ten) return v.join("=");
  }
  return "";
}

function trangDangNhap(sai) {
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>F2DR Vận hành</title>
<style>
html,body{height:100%;margin:0;background:#0b1220;color:#e6edf7;font-family:"Segoe UI",system-ui,sans-serif}
body{display:flex;align-items:center;justify-content:center}
form{width:min(360px,88vw);background:#111b2e;border:1px solid #223455;border-radius:14px;padding:28px 26px}
h1{font-size:18px;margin:0 0 4px;font-weight:600}
p{margin:0 0 18px;font-size:13px;color:#8fa3c4}
input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid #2c4268;background:#0b1424;color:#e6edf7;font-size:15px}
input:focus{outline:none;border-color:#4da3ff}
button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:8px;background:#2d7ff9;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#4a92fb}
.sai{margin-top:12px;font-size:13px;color:#ff7a7a}
</style></head><body>
<form method="post" action="/__dangnhap">
<h1>F2DR Vận hành</h1>
<p>Nhập mật khẩu để xem.</p>
<input type="password" name="mat_khau" placeholder="Mật khẩu" autocomplete="current-password" autofocus required>
<button type="submit">Vào</button>
${sai ? '<div class="sai">Mật khẩu chưa đúng.</div>' : ""}
</form></body></html>`;
  return new Response(html, {
    status: sai ? 401 : 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const duong = url.pathname;
  const dangNhap = duong === "/__dangnhap";

  if (!dangNhap && !TRANG_BAO_VE(duong)) return next();

  if (!env.MAT_KHAU) {
    return new Response("Chưa cấu hình mật khẩu.", { status: 503, headers: { "cache-control": "no-store" } });
  }

  const khoaMay = request.headers.get("x-f2dr-khoa");
  if (env.KHOA_MAY && khoaMay && bangNhau(khoaMay, env.KHOA_MAY)) return next();

  const the = await bam(env.MAT_KHAU + "|f2dr-van-hanh|v1");

  if (dangNhap) {
    if (request.method !== "POST") return Response.redirect(url.origin + "/", 303);
    const ip = request.headers.get("cf-connecting-ip") || "khong-ro";
    const khoaSai = "sai:" + ip;
    let soSai = 0;
    if (env.XACNHAN) {
      soSai = parseInt((await env.XACNHAN.get(khoaSai)) || "0", 10) || 0;
      if (soSai >= 8) {
        return new Response("Nhập sai quá nhiều lần. Thử lại sau 15 phút.", {
          status: 429,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
      }
    }
    const f = await request.formData();
    const mk = String(f.get("mat_khau") || "");
    const dung = bangNhau(await bam(mk + "|f2dr-van-hanh|v1"), the);
    if (!dung) {
      if (env.XACNHAN) await env.XACNHAN.put(khoaSai, String(soSai + 1), { expirationTtl: 900 });
      await new Promise((r) => setTimeout(r, 800));
      return trangDangNhap(true);
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "set-cookie": `f2dr_vh=${the}; Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`,
        "cache-control": "no-store",
      },
    });
  }

  const cookie = docCookie(request, "f2dr_vh");
  if (cookie && bangNhau(cookie, the)) {
    const res = await next();
    const r2 = new Response(res.body, res);
    r2.headers.set("cache-control", "private, no-store");
    r2.headers.set("x-robots-tag", "noindex");
    return r2;
  }

  if (duong.startsWith("/api/")) {
    return new Response(JSON.stringify({ loi: "chua_dang_nhap" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return trangDangNhap(false);
}
