const NHAN_HOP_LE = new Set(["duong", "vang", "xanh"]);
const RX_NGAY = /^20\d\d-\d\d-\d\d$/;
const RX_KH = /^[A-Za-z0-9_-]{4,64}$/;
const KHOA_KV = "tat_ca";
const KHOA_NHAT_KY = "nhat_ky";
const NHAT_KY_TOI_DA = 3000;

function json(d, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function doc(env, khoa) {
  const s = await env.XACNHAN.get(khoa);
  if (!s) return khoa === KHOA_NHAT_KY ? [] : {};
  try {
    return JSON.parse(s);
  } catch (e) {
    return khoa === KHOA_NHAT_KY ? [] : {};
  }
}

async function ghiNhatKy(env, muc) {
  const nk = await doc(env, KHOA_NHAT_KY);
  nk.push(muc);
  await env.XACNHAN.put(KHOA_NHAT_KY, JSON.stringify(nk.slice(-NHAT_KY_TOI_DA)));
}

async function docBody(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.XACNHAN) return json({ loi: "chua_gan_kho" }, 503);
  const url = new URL(request.url);
  if (url.searchParams.get("nhat_ky") === "1") return json(await doc(env, KHOA_NHAT_KY));
  return json(await doc(env, KHOA_KV));
}

export async function onRequestPost({ request, env }) {
  if (!env.XACNHAN) return json({ loi: "chua_gan_kho" }, 503);
  const b = await docBody(request);
  if (!b) return json({ loi: "du_lieu_khong_hop_le" }, 400);
  const ngay = String(b.ngay || "");
  const kh = String(b.kh || "");
  const nhan = String(b.nhan || "");
  const lyDo = String(b.ly_do || "").trim();
  if (!RX_NGAY.test(ngay) || !RX_KH.test(kh)) return json({ loi: "sai_ma_ca" }, 400);
  if (!NHAN_HOP_LE.has(nhan)) return json({ loi: "sai_nhan" }, 400);
  if (lyDo.length < 3) return json({ loi: "thieu_ly_do" }, 400);
  if (lyDo.length > 2000) return json({ loi: "ly_do_qua_dai" }, 400);

  const tatCa = await doc(env, KHOA_KV);
  const khoa = ngay + "|" + kh;
  const luc = new Date().toISOString();
  const cu = tatCa[khoa] || { lich_su: [] };
  const lichSu = (cu.lich_su || []).concat([{ nhan, ly_do: lyDo, luc }]).slice(-20);
  tatCa[khoa] = { nhan, ly_do: lyDo, luc, lich_su: lichSu };
  await env.XACNHAN.put(KHOA_KV, JSON.stringify(tatCa));
  await ghiNhatKy(env, { hanh_dong: "luu", khoa, nhan, ly_do: lyDo, luc });
  return json({ ok: true, khoa, nhan, ly_do: lyDo, luc });
}

export async function onRequestDelete({ request, env }) {
  if (!env.XACNHAN) return json({ loi: "chua_gan_kho" }, 503);
  const b = await docBody(request);
  if (!b) return json({ loi: "du_lieu_khong_hop_le" }, 400);
  const ngay = String(b.ngay || "");
  const kh = String(b.kh || "");
  if (!RX_NGAY.test(ngay) || !RX_KH.test(kh)) return json({ loi: "sai_ma_ca" }, 400);
  const tatCa = await doc(env, KHOA_KV);
  const khoa = ngay + "|" + kh;
  if (!tatCa[khoa]) return json({ loi: "khong_co" }, 404);
  const cu = tatCa[khoa];
  delete tatCa[khoa];
  const luc = new Date().toISOString();
  await env.XACNHAN.put(KHOA_KV, JSON.stringify(tatCa));
  await ghiNhatKy(env, { hanh_dong: "xoa", khoa, nhan_cu: cu.nhan, ly_do_cu: cu.ly_do, luc });
  return json({ ok: true, khoa, luc });
}
