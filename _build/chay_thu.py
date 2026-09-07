# -*- coding: utf-8 -*-
"""
CHAY THU BAN PAGES NGAY TREN MAY — khong can Node/wrangler.

Mo phong dung hai thu Cloudflare Pages lam:
  1. Phuc vu thu muc public/ nhu trang tinh
  2. Cam route POST /api/gemini — lam dung viec functions/api/gemini.js lam:
     nhan {model, khoa, than}, tra so thu tu khoa ra khoa that, goi Gemini

Nho vay kiem duoc chatbot chay that TRUOC khi deploy, thay vi day len roi
moi phat hien hong.

    py -3.10 _build/chay_thu.py            (khoa lay tu secrets.toml ben Deploy)
    py -3.10 _build/chay_thu.py --cong 8910

Day CHI la ban mo phong de thu. Tren Cloudflare that thi functions/api/
gemini.js chay, khong phai file nay.
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
GOC = os.path.dirname(HERE)
DEPLOY = os.path.join(os.path.dirname(GOC), "F2DR Van Hanh Deploy")
PUBLIC = os.path.join(GOC, "public")

MODEL_CHO_PHEP = {
    "gemini-3.1-flash-lite", "gemini-3.1-flash",
    "gemini-2.5-flash-lite", "gemini-2.5-flash",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-flash", "gemini-1.5-flash-8b",
}


def doc_khoa():
    """Lay khoa tu secrets.toml ben Deploy — dung cho nguon voi ban that."""
    f = os.path.join(DEPLOY, ".streamlit", "secrets.toml")
    if not os.path.exists(f):
        return []
    s = open(f, encoding="utf-8").read()
    ds = []
    m = re.search(r"GEMINI_API_KEYS\s*=\s*\[(.*?)\]", s, re.S)
    if m:
        ds = re.findall(r'"([^"\s]+)"', m.group(1))
    m1 = re.search(r'GEMINI_API_KEY\s*=\s*"([^"]+)"', s)
    if m1 and m1.group(1) not in ds:
        ds.insert(0, m1.group(1))
    return ds


KHOA = []


class May(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=PUBLIC, **kw)

    def log_message(self, fmt, *a):
        if "/api/" in (self.path or ""):
            sys.stderr.write("  %s\n" % (fmt % a))

    def _tra(self, du_lieu, ma=200):
        b = json.dumps(du_lieu, ensure_ascii=False).encode("utf-8")
        self.send_response(ma)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/gemini"):
            return self._tra({
                "ok": bool(KHOA),
                "so_khoa": len(KHOA),
                "duoi_khoa": ["…" + k[-4:] for k in KHOA],
                "ghi_chu": "ban mo phong tren may",
            })
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/gemini"):
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        try:
            yc = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._tra({"error": {"message": "than khong phai JSON"}}, 400)

        model = yc.get("model")
        than = yc.get("than")
        i = yc.get("khoa", 0)

        if model not in MODEL_CHO_PHEP:
            return self._tra(
                {"error": {"message": "model khong duoc phep: %s" % model}}, 400)
        if not isinstance(than, dict):
            return self._tra({"error": {"message": "thieu 'than'"}}, 400)
        if not KHOA:
            return self._tra({"error": {"message": "chua co khoa"}}, 503)
        if not isinstance(i, int) or i < 0 or i >= len(KHOA):
            return self._tra(
                {"error": {"message": "RESOURCE_EXHAUSTED: het khoa thu %s" % i}},
                429)

        u = ("https://generativelanguage.googleapis.com/v1beta/models/"
             "%s:generateContent?key=%s" % (model, KHOA[i]))
        rq = urllib.request.Request(
            u, data=json.dumps(than).encode("utf-8"),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(rq, timeout=90) as r:
                b = r.read()
                ma = r.status
        except urllib.error.HTTPError as e:      # tra nguyen van loi Gemini
            b, ma = e.read(), e.code
        except Exception as e:
            return self._tra({"error": {"message": "khong goi duoc: %s" % e}}, 502)

        self.send_response(ma)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


def main():
    global KHOA
    ap = argparse.ArgumentParser()
    ap.add_argument("--cong", type=int, default=8910)
    a = ap.parse_args()

    if not os.path.exists(os.path.join(PUBLIC, "index.html")):
        sys.exit("Chua co public/index.html — chay _build/dung_pages.py truoc.")

    KHOA = doc_khoa()
    print("=" * 66)
    print("CHAY THU BAN PAGES (mo phong Cloudflare)")
    print("=" * 66)
    print("Thu muc : %s" % PUBLIC)
    print("Khoa    : %s" % (
        "%d khoa (%s)" % (len(KHOA), ", ".join("…" + k[-4:] for k in KHOA))
        if KHOA else "KHONG CO -> chat se bao thieu khoa"))
    print("Dia chi : http://localhost:%d" % a.cong)
    print("Kiem key: http://localhost:%d/api/gemini" % a.cong)
    print("=" * 66)
    ThreadingHTTPServer(("127.0.0.1", a.cong), May).serve_forever()


if __name__ == "__main__":
    main()
