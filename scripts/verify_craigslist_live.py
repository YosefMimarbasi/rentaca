"""Re-fetch each craigslist post live and re-derive its price from the page.

For every craigslist listing with a URL: GET the live post, pull the
price + posting body, classify property-total vs per-person using the same
rules as fix_craigslist_price, and write the corrected value. Expired/410
posts keep their existing value. Polite 1s delay; resumable cache.
"""
import json
import re
import time
import ssl
import urllib.request
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from fix_craigslist_price import classify, beds_from_text  # reuse logic

DB = ROOT / "data" / "apartments.json"
CACHE = ROOT / "data" / "_cl_live_cache.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15, context=CTX) as r:
        return r.read().decode("utf-8", "ignore")


def main():
    db = json.load(open(DB, encoding="utf-8"))
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cl = [a for a in db if a.get("source") == "craigslist"
          and ((a.get("listing_info", {}) or {}).get("url") or a.get("url"))]
    print(f"craigslist with url: {len(cl)}")

    dead = changed = ok = 0
    for i, a in enumerate(cl, 1):
        url = (a.get("listing_info", {}) or {}).get("url") or a.get("url")
        if url in cache:
            html = cache[url]
        else:
            try:
                html = fetch(url)
            except Exception as e:
                html = "DEAD" if "410" in str(e) or "404" in str(e) else ""
                if not html:
                    html = "ERR"
            cache[url] = html
            time.sleep(1.0)
            if i % 20 == 0:
                CACHE.write_text(json.dumps(cache))
                print(f"  ...{i}/{len(cl)}")
        if html in ("DEAD", "ERR", ""):
            dead += 1
            continue

        body = re.sub(r"<[^>]+>", " ", html)
        m = re.search(r"<span[^>]*class=\"price\"[^>]*>\s*\$?([\d,]+)", html)
        price = int(m.group(1).replace(",", "")) if m else 0
        bm = re.search(r"(\d+)\s*BR", body)
        beds = int(bm.group(1)) if bm else (a.get("housing", {}).get("bedrooms", 0) or 0)
        beds = beds_from_text(body, beds)

        tot, pp, bo = classify(body, beds)
        p = a.setdefault("pricing", {})
        cur = p.get("monthly_rent_total", 0)
        if tot is None:
            # no per-person/total phrasing -> the visible price is the unit total
            if price and 400 <= price <= 16000:
                tot = price
                pp = round(price / beds) if beds > 0 else price
            else:
                ok += 1
                continue
        fb = bo if bo is not None else beds
        if cur == tot and p.get("per_person_monthly") == pp:
            ok += 1
            continue
        if fb:
            a["housing"]["bedrooms"] = fb
        p["monthly_rent_total"] = tot
        p["per_person_monthly"] = pp
        changed += 1

    CACHE.write_text(json.dumps(cache))
    json.dump(db, open(DB, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"live-verified craigslist: changed={changed} unchanged={ok} dead/expired={dead}")


if __name__ == "__main__":
    main()
