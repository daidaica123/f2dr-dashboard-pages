# -*- coding: utf-8 -*-
"""
DUNG BAN CLOUDFLARE PAGES.

Lay dashboard + panel chat tu thu muc Deploy, ghep lai, nhung nhung KHONG
kem khoa API. Thay vao do khai dia chi ham trung gian /api/gemini — khoa
that nam o bien moi truong Cloudflare, trang khong bao gio thay.

    py -3.13 _build/dung_pages.py

Ra: public/index.html

Vi sao tach thanh script rieng thay vi dung xem_truoc.py:
xem_truoc.py NHUNG KHOA vao file (ban chay tren may). Ban Pages la trang
CONG KHAI, nhung khoa vao la lo ngay. Hai muc dich nguoc nhau nen tach.

Dung chung ham ghep() cua xem_truoc.py, chi khac phan cau hinh — de ban
Pages khong the lech khoi ban HTML va ban Streamlit.
"""
import argparse
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GOC = os.path.dirname(HERE)                    # …\F2DR Van Hanh Pages
DEPLOY = os.path.join(os.path.dirname(GOC), "F2DR Van Hanh Deploy")
BUILD_DEPLOY = os.path.join(DEPLOY, "_build")

# Dung chung ma nguon voi ban Deploy: mot cho sua, ca ba ban cung doi.
sys.path.insert(0, BUILD_DEPLOY)

DASH = os.path.join(DEPLOY, "F2DR_Van_Hanh.html")
PUBLIC = os.path.join(GOC, "public")
RA = os.path.join(PUBLIC, "index.html")

DIA_CHI_PROXY = "/api/gemini"
SO_KHOA_MAC_DINH = 5        # so khoa may chu dang giu; chi de trang biet
                            # duyet bao nhieu vong, khong phai khoa that


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dash", default=DASH)
    ap.add_argument("--out", default=RA)
    ap.add_argument("--so-khoa", type=int, default=SO_KHOA_MAC_DINH,
                    help="So khoa dat o Cloudflare (chi de trang biet duyet "
                         "may vong khi mot khoa het luot)")
    a = ap.parse_args()

    print("=" * 70)
    print("DUNG BAN CLOUDFLARE PAGES")
    print("=" * 70)

    import soat_js
    import xem_truoc

    js = [xem_truoc.JS_TRI_THUC, xem_truoc.JS_BO_NAO,
          xem_truoc.JS_KHO, xem_truoc.JS_UI]
    print("Soat cu phap JS:")
    if soat_js.main(js):
        sys.exit("Dung lai: sua loi JS o tren roi chay lai.")
    print()

    if not os.path.exists(a.dash):
        sys.exit("Thieu dashboard: %s\n"
                 "Dung no truoc bang _build/build_van_hanh.py o thu muc Deploy."
                 % a.dash)

    dash = xem_truoc.doc(a.dash)

    # ghep() voi danh sach khoa RONG -> trang khong co khoa nao.
    ra = xem_truoc.ghep(dash, [])

    # Thay khoi cau hinh: bo khoaAPI rong, khai proxy + so khoa may chu giu.
    cu = ('<script>window.F2_CAU_HINH = '
          + json.dumps({"khoaAPI": []}, ensure_ascii=False) + ';</script>')
    moi = ('<script>window.F2_CAU_HINH = '
           + json.dumps({"khoaAPI": [], "proxy": DIA_CHI_PROXY,
                         "soKhoa": a.so_khoa}, ensure_ascii=False)
           + ';</script>')
    if cu not in ra:
        sys.exit("Khong tim thay khoi F2_CAU_HINH de thay — xem lai ghep().")
    ra = ra.replace(cu, moi, 1)

    # Chan chac: file ra tuyet doi khong duoc chua khoa API.
    # Quet CA HAI dang khoa dang ton tai:
    #   AIza…      khoa Google API kieu cu
    #   AQ.Ab8RN6… khoa Gemini kieu moi (dang dung) — mau khac han, chi
    #              quet AIza thi lot het, va do la loai dang dung THAT.
    import re
    lo = (re.findall(r"AIza[0-9A-Za-z_\-]{20,}", ra) +
          re.findall(r"AQ\.[0-9A-Za-z_\-]{30,}", ra))
    if lo:
        sys.exit("DUNG LAI: file ra co %d khoa API lot vao (%s…). "
                 "Khong duoc deploy." % (len(lo), lo[0][:14]))

    os.makedirs(PUBLIC, exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(ra)

    # Chan bot tim kiem: trang cong khai nhung khong nen tu noi len Google.
    with open(os.path.join(PUBLIC, "robots.txt"), "w", encoding="utf-8") as f:
        f.write("User-agent: *\nDisallow: /\n")

    kb = len(ra) / 1024
    print("Dashboard : %s  (%s bytes)"
          % (os.path.basename(a.dash), format(len(dash), ",")))
    print("Khoa API  : KHONG nhung (dung /api/gemini, khoa o Cloudflare)")
    print("So khoa   : %d  (trang chi biet SO LUONG de duyet vong)" % a.so_khoa)
    print("-" * 70)
    print("XONG: public/index.html")
    print("      %s bytes (%.1f MB)" % (format(len(ra), ","), kb / 1024))
    print("      public/robots.txt  (chan bot tim kiem)")
    if kb / 1024 > 24:
        print()
        print("!! CANH BAO: gan cham gioi han 25 MB/file cua Cloudflare Pages.")
    print()
    print("Buoc tiep:")
    print("  1. Day thu muc nay len mot repo GitHub")
    print("  2. Cloudflare Pages -> Create -> Connect to Git -> chon repo")
    print("     Build command    : (de trong)")
    print("     Build output dir : public")
    print("  3. Settings -> Environment variables, them:")
    print("     GEMINI_API_KEYS = khoa1,khoa2,khoa3,khoa4,khoa5")
    print("  4. Mo <trang>/api/gemini bang trinh duyet de kiem tra da co khoa")


if __name__ == "__main__":
    main()
