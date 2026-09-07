/* ══════════════════════════════════════════════════════════════════════
   CỬA TRUNG GIAN GỌI GEMINI  —  Cloudflare Pages Functions
   Đường: POST /api/gemini

   Vì sao phải có file này:
     Bản Streamlit ghép khoá API vào trang lúc chạy, lấy từ Secrets, nên
     repo sạch. Cloudflare Pages chỉ phục vụ file tĩnh — không có "lúc
     chạy" nào cả. Nhét khoá thẳng vào HTML thì ai xem mã nguồn trang
     cũng thấy, và bot quét sẽ tìm ra trong vài giờ.

     Hàm này chạy ở phía Cloudflare, giữ khoá trong biến môi trường.
     Trình duyệt gửi lên SỐ THỨ TỰ khoá (0, 1, 2…) chứ không phải khoá
     thật; hàm tra ra khoá tương ứng rồi mới gọi Gemini.

   Nhờ cách đánh số này mà toàn bộ cơ chế xoay khoá bên _chat_bo_nao.js
   giữ nguyên: nó vẫn biết "khoá 3 + model X đã hết lượt hôm nay" và tự
   né, trong khi không hề biết khoá thật là gì.

   Biến môi trường cần đặt (Cloudflare → Settings → Environment variables):
     GEMINI_API_KEYS = khoá1,khoá2,khoá3,…      ← nhiều khoá, phân tách bằng dấu phẩy
     GEMINI_API_KEY  = khoá                     ← hoặc một khoá
   ══════════════════════════════════════════════════════════════════════ */

/* Chỉ cho gọi đúng các model đang dùng. Thiếu lớp này thì địa chỉ
   /api/gemini thành cổng gọi Gemini miễn phí cho bất kỳ ai nhặt được
   link — họ đốt hạn mức bằng khoá của mình. */
const MODEL_CHO_PHEP = new Set([
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
]);

const CO_THAN_THIEN = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function traLoi(du_lieu, ma = 200) {
  return new Response(JSON.stringify(du_lieu), {
    status: ma,
    headers: { "Content-Type": "application/json", ...CO_THAN_THIEN },
  });
}

function dsKhoa(env) {
  const nhieu = env.GEMINI_API_KEYS || "";
  const ds = nhieu
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const mot = (env.GEMINI_API_KEY || "").trim();
  if (mot && !ds.includes(mot)) ds.unshift(mot);
  return ds;
}

/* Trình duyệt hỏi trước khi POST khác nguồn. */
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CO_THAN_THIEN });
}

/* Cho phép mở bằng trình duyệt để xem đã đặt khoá chưa — KHÔNG lộ khoá,
   chỉ nói có mấy khoá và bốn ký tự cuối. */
export function onRequestGet({ env }) {
  const ks = dsKhoa(env);
  return traLoi({
    ok: ks.length > 0,
    so_khoa: ks.length,
    duoi_khoa: ks.map((k) => "…" + k.slice(-4)),
    ghi_chu: ks.length
      ? "Đã có khoá. Trợ lý dùng được."
      : "CHƯA CÓ KHOÁ — đặt GEMINI_API_KEYS trong Settings → Environment variables.",
  });
}

export async function onRequestPost({ request, env }) {
  const ks = dsKhoa(env);
  if (!ks.length) {
    return traLoi(
      {
        error: {
          message:
            "Máy chủ chưa được đặt khoá Gemini. Vào Cloudflare → Settings → " +
            "Environment variables, thêm GEMINI_API_KEYS.",
        },
      },
      503
    );
  }

  let yeu_cau;
  try {
    yeu_cau = await request.json();
  } catch (e) {
    return traLoi({ error: { message: "Thân yêu cầu không phải JSON" } }, 400);
  }

  const { model, khoa, than } = yeu_cau || {};

  if (!model || !MODEL_CHO_PHEP.has(model)) {
    return traLoi(
      { error: { message: "Model không nằm trong danh sách cho phép: " + model } },
      400
    );
  }
  if (!than || typeof than !== "object") {
    return traLoi({ error: { message: "Thiếu phần 'than' của yêu cầu" } }, 400);
  }

  /* Số thứ tự khoá: bên gọi chỉ biết "khoá thứ mấy", không biết khoá thật.
     Vượt quá số khoá đang có thì báo hết lượt để bên kia thôi dò tiếp —
     đúng cách nó xử lý khi một khoá cạn hạn mức. */
  const i = Number.isInteger(khoa) ? khoa : 0;
  if (i < 0 || i >= ks.length) {
    return traLoi(
      { error: { message: "RESOURCE_EXHAUSTED: không còn khoá thứ " + i } },
      429
    );
  }

  const dia_chi =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(ks[i]);

  try {
    const r = await fetch(dia_chi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(than),
    });
    const van = await r.text();

    /* Trả nguyên văn cả khi Gemini báo lỗi: bên gọi đọc mã lỗi để quyết
       định đổi khoá hay đổi model. Nuốt lỗi ở đây là làm hỏng cơ chế đó. */
    return new Response(van, {
      status: r.status,
      headers: { "Content-Type": "application/json", ...CO_THAN_THIEN },
    });
  } catch (e) {
    return traLoi(
      { error: { message: "Không gọi được Gemini: " + (e.message || e) } },
      502
    );
  }
}
