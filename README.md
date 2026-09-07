# F2DR Vận hành — bản Cloudflare Pages

Bản thứ ba của dashboard, chạy song song chứ không thay thế:

| Bản | Ở đâu | Dùng khi |
|---|---|---|
| HTML | `F2DR Van Hanh Deploy\F2DR_Van_Hanh_xemtruoc.html` | sửa giao diện, xem offline |
| Streamlit | f2drdashboard.streamlit.app | dựng lại từ CSV mới trên web |
| **Pages** | Cloudflare | **xem hằng ngày — nhanh nhất, không ngủ đông** |

Cả ba dùng **chung một bộ mã nguồn** ở `F2DR Van Hanh Deploy\_build\`. Sửa
một chỗ là cả ba cùng đổi, nên không thể lệch nhau.

---

## Khác biệt cốt lõi: khoá API

Đây là lý do bản này phải tách riêng.

Bản Streamlit ghép khoá vào trang **lúc chạy**, lấy từ Secrets, nên repo sạch.
Cloudflare Pages chỉ phục vụ file tĩnh — **không có "lúc chạy" nào cả**. Nhét
khoá vào HTML thì ai xem mã nguồn trang cũng thấy, và bot quét sẽ tìm ra
trong vài giờ.

Cách giải: một hàm trung gian `functions/api/gemini.js` chạy phía Cloudflare,
giữ khoá ở biến môi trường.

```
Trình duyệt  ──{model, khoa: 2, than}──>  /api/gemini  ──khoá thật──>  Gemini
                    ▲                                        
              chỉ gửi SỐ THỨ TỰ khoá,
              không bao giờ thấy khoá thật
```

Gửi số thứ tự thay vì khoá là điểm mấu chốt: cơ chế xoay khoá vẫn nhớ được
"khoá 3 + model X đã hết lượt hôm nay" và tự né — y hệt bản cũ — trong khi
trình duyệt không hề biết khoá thật là gì.

---

## Dựng lại

```
py -3.13 _build/dung_pages.py
```

Đọc `F2DR_Van_Hanh.html` bên thư mục Deploy, ghép panel chat, ghi ra
`public/index.html`. Script **tự chặn**: thấy chuỗi `AIza…` trong file ra là
dừng, không cho deploy.

## Chạy thử tại máy trước khi deploy

```
py -3.10 _build/chay_thu.py
```

Mở http://localhost:8910 — máy chủ nhỏ mô phỏng đúng hai việc Cloudflare làm
(phục vụ `public/` + route `/api/gemini`), nên kiểm được chatbot chạy thật
trước khi đẩy lên.

## Deploy

1. Đẩy thư mục này lên một repo GitHub
2. Cloudflare Pages → Create → Connect to Git → chọn repo
   - Build command: **để trống**
   - Build output directory: **public**
3. Settings → Environment variables → thêm:
   ```
   GEMINI_API_KEYS = khoa1,khoa2,khoa3,khoa4,khoa5
   ```
   (phân tách bằng dấu phẩy, không có ngoặc kép)
4. Mở `<địa-chỉ-trang>/api/gemini` bằng trình duyệt để kiểm tra đã nhận khoá

Sau bước 2, **mỗi lần `git push` là Cloudflare tự dựng lại và phát hành** —
không phải bấm gì thêm.

---

## Lưu ý

**Trang công khai.** Ai có link đều xem được (bạn đã chọn vậy). `robots.txt`
chặn bot tìm kiếm nên trang không tự nổi lên Google, nhưng đó không phải bảo
mật thật. Muốn chặn hẳn thì bật **Cloudflare Access** — miễn phí tới 50 người,
không phải sửa code.

**Không có chức năng dựng lại từ CSV.** Pages không chạy Python. Nạp dữ liệu
mới thì dựng ở máy rồi push, hoặc dùng bản Streamlit.

**Giới hạn 25 MB/file.** Hiện `index.html` 4,9 MB. Còn nhiều chỗ, nhưng dữ
liệu tăng thì để ý.
