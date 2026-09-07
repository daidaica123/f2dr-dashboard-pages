/* ══════════════════════════════════════════════════════════════════════
   CỬA TRUNG GIAN GỌI MODEL  —  Cloudflare Pages Functions
   Đường: POST /api/gemini

   Vì sao phải có file này:
     Bản Streamlit ghép khoá API vào trang lúc chạy, lấy từ Secrets, nên
     repo sạch. Cloudflare Pages chỉ phục vụ file tĩnh — không có "lúc
     chạy" nào cả. Nhét khoá thẳng vào HTML thì ai xem mã nguồn trang
     cũng thấy, và bot quét sẽ tìm ra trong vài giờ.

     Hàm này chạy ở phía Cloudflare, giữ khoá trong biến môi trường.
     Trình duyệt gửi lên SỐ THỨ TỰ khoá (0, 1, 2…) chứ không phải khoá
     thật; hàm tra ra khoá tương ứng rồi mới gọi model.

   Nhờ cách đánh số này mà toàn bộ cơ chế xoay khoá bên _chat_bo_nao.js
   giữ nguyên: nó vẫn biết "khoá 3 + model X đã hết lượt hôm nay" và tự
   né, trong khi không hề biết khoá thật là gì.

   ───────── HAI ĐƯỜNG GỌI ─────────
   Google CHẶN Gemini API theo vị trí máy chủ. Hàm này chạy ở trung tâm
   dữ liệu Cloudflare gần người dùng nhất — với Việt Nam thường là Hồng
   Kông, mà Hồng Kông nằm trong vùng Google không cho dùng. Gọi thẳng
   Gemini từ đây trả về "User location is not supported for the API use".

   Nên hàm nhận cả hai loại khoá:
     OPENROUTER_API_KEY  -> đi qua OpenRouter (không chặn theo vùng)
     GEMINI_API_KEYS     -> gọi thẳng Google (chỉ chạy ở vùng được phép)
   Có khoá OpenRouter thì ưu tiên dùng; không thì quay về Gemini.

   Biến môi trường (Cloudflare → Settings → Variables and Secrets):
     OPENROUTER_API_KEY = sk-or-v1-…              ← nên dùng
     GEMINI_API_KEYS    = khoá1,khoá2,…           ← chỉ chạy ở vùng được phép
   ══════════════════════════════════════════════════════════════════════ */

/* Chỉ cho gọi đúng các model đang dùng. Thiếu lớp này thì địa chỉ
   /api/gemini thành cổng gọi model miễn phí cho bất kỳ ai nhặt được
   link — họ đốt hạn mức bằng khoá của mình. */
const MODEL_CHO_PHEP = new Set([
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-flash-latest",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]);

/* Tên model bên OpenRouter khác hẳn tên Google, và bậc miễn phí KHÔNG
   còn model Gemini nào (đo 07/09/2026: 21 model giá 0, không cái nào là
   Gemini). Nên ánh xạ sang các model miễn phí đã thử chạy được thật.

   Bốn model dưới đây đều đã kiểm: gọi được, sinh JSON đúng khuôn mà bộ
   não yêu cầu. Xếp theo tốc độ đo được. Bên trình duyệt xoay qua 7 tên
   Gemini, ở đây trải chúng lên 4 model này — hết lượt cái đầu thì cơ chế
   xoay khoá tự đẩy sang tên sau, tức là sang model khác. */
const DU_PHONG_OR = "google/gemma-4-26b-a4b-it:free";
const TEN_OPENROUTER = {
  "gemini-3.1-flash-lite": "google/gemma-4-26b-a4b-it:free",       // 1,5s
  "gemini-3.8-flash": "inclusionai/ling-3.0-flash-sante:free",     // 1,7s
  "gemini-3.5-flash": "minimax/minimax-m2.7:free",                 // 7,7s
  "gemini-3-flash-preview": "nvidia/nemotron-3.5-lightning:free",  // 7,9s
  "gemini-flash-latest": "google/gemma-4-26b-a4b-it:free",
  "gemini-3.7-flash": "inclusionai/ling-3.0-flash-sante:free",
  "gemini-2.5-flash": "minimax/minimax-m2.7:free",
  "gemini-2.5-flash-lite": "google/gemma-4-26b-a4b-it:free",
  "gemini-2.0-flash": "minimax/minimax-m2.7:free",
  "gemini-2.0-flash-lite": "google/gemma-4-26b-a4b-it:free",
};

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

function dsKhoaGemini(env) {
  const ds = (env.GEMINI_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const mot = (env.GEMINI_API_KEY || "").trim();
  if (mot && !ds.includes(mot)) ds.unshift(mot);
  return ds;
}

function dsKhoaOR(env) {
  const ds = (env.OPENROUTER_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const mot = (env.OPENROUTER_API_KEY || "").trim();
  if (mot && !ds.includes(mot)) ds.unshift(mot);
  return ds;
}

/* Trình duyệt hỏi trước khi POST khác nguồn. */
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CO_THAN_THIEN });
}

/* Mở bằng trình duyệt để xem đã đặt khoá chưa — KHÔNG lộ khoá, chỉ nói
   có mấy khoá, đi đường nào, và bốn ký tự cuối. */
export function onRequestGet({ env }) {
  const or = dsKhoaOR(env);
  const gm = dsKhoaGemini(env);
  const ds = or.length ? or : gm;
  return traLoi({
    ok: ds.length > 0,
    duong: or.length ? "openrouter" : gm.length ? "gemini" : "(chưa có)",
    so_khoa: ds.length,
    duoi_khoa: ds.map((k) => "…" + k.slice(-4)),
    ghi_chu: or.length
      ? "Đi qua OpenRouter — không bị chặn theo vùng."
      : gm.length
      ? "Gọi thẳng Gemini. Lưu ý: Google chặn một số vùng (Hồng Kông…), " +
        "nếu gặp lỗi 'User location is not supported' thì thêm OPENROUTER_API_KEY."
      : "CHƯA CÓ KHOÁ — đặt OPENROUTER_API_KEY trong Settings → Variables and Secrets.",
  });
}

/* ───────── gọi qua OpenRouter ─────────
   OpenRouter nói giọng OpenAI, còn phần còn lại của hệ thống nói giọng
   Gemini. Dịch hai chiều ở đây để bên trình duyệt không phải biết mình
   đang đi đường nào. */
async function quaOpenRouter(model, than, khoa, url) {
  const phan = (than.contents || [])
    .flatMap((c) => (c.parts || []).map((p) => p.text || ""))
    .join("\n");
  const cfg = than.generationConfig || {};

  const yc = {
    model: TEN_OPENROUTER[model] || DU_PHONG_OR,
    messages: [{ role: "user", content: phan }],
    temperature: cfg.temperature == null ? 0 : cfg.temperature,
  };
  if (cfg.responseMimeType === "application/json") {
    yc.response_format = { type: "json_object" };
  }

  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + khoa,
      "HTTP-Referer": url,
      "X-Title": "F2DR Van Hanh",
    },
    body: JSON.stringify(yc),
  });

  const j = await r.json();
  if (!r.ok || j.error) {
    /* Giữ nguyên chữ "RESOURCE_EXHAUSTED" khi hết hạn mức: bên gọi dựa
       vào chuỗi đó để quyết định đổi khoá hay đổi model. */
    const tin = (j.error && (j.error.message || j.error)) || "HTTP " + r.status;
    const het = r.status === 429 || /quota|rate limit/i.test(String(tin));
    return traLoi(
      { error: { message: (het ? "RESOURCE_EXHAUSTED: " : "") + tin } },
      r.status || 500
    );
  }

  /* Dịch ngược sang dạng Gemini để bên trình duyệt đọc như thường. */
  const van =
    (j.choices && j.choices[0] && j.choices[0].message &&
      j.choices[0].message.content) || "";
  return traLoi({ candidates: [{ content: { parts: [{ text: van }] } }] });
}

export async function onRequestPost({ request, env }) {
  const or = dsKhoaOR(env);
  const gm = dsKhoaGemini(env);
  const ds = or.length ? or : gm;

  if (!ds.length) {
    return traLoi(
      {
        error: {
          message:
            "Máy chủ chưa được đặt khoá. Vào Cloudflare → Settings → " +
            "Variables and Secrets, thêm OPENROUTER_API_KEY.",
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
  if (i < 0 || i >= ds.length) {
    return traLoi(
      { error: { message: "RESOURCE_EXHAUSTED: không còn khoá thứ " + i } },
      429
    );
  }

  try {
    if (or.length) {
      return await quaOpenRouter(model, than, ds[i], new URL(request.url).origin);
    }

    const dia_chi =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) +
      ":generateContent?key=" +
      encodeURIComponent(ds[i]);

    const r = await fetch(dia_chi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(than),
    });
    const van = await r.text();

    /* Trả nguyên văn cả khi báo lỗi: bên gọi đọc mã lỗi để quyết định đổi
       khoá hay đổi model. Nuốt lỗi ở đây là làm hỏng cơ chế đó. */
    return new Response(van, {
      status: r.status,
      headers: { "Content-Type": "application/json", ...CO_THAN_THIEN },
    });
  } catch (e) {
    return traLoi(
      { error: { message: "Không gọi được model: " + (e.message || e) } },
      502
    );
  }
}
