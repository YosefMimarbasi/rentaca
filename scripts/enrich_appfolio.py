"""Enrich AppFolio listings with detail-page data.

The AppFolio index scraper only captures one thumbnail + summary rent. Each
listing's detail page (``/listings/detail/<uuid>``) carries the full photo
gallery, exact rent, security deposit, availability, utilities-included
flags, bed/bath, square footage, lease terms, pet policy, the description,
and the management company phone. This fetches each detail page once and
merges those fields back into the listing.

Polite: one request per listing with a short delay; resumable via a cache so
re-runs don't re-fetch. No API keys involved (AppFolio detail pages are
public HTML).
"""
import json
import re
import time
import logging
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"
CACHE = ROOT / "data" / "appfolio_detail_cache.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
APPFOLIO_SOURCES = {"modernliving", "ppmhomes", "travishyde"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def parse_detail(html: str) -> dict:
    out = {}
    # --- gallery (prefer large/original, dedupe by image id) ---
    raw = re.findall(
        r"https://images\.cdn\.appfolio\.com/[^\s\"']+?/"
        r"(?:large|original)\.(?:jpg|jpeg|png|webp)", html)
    seen, imgs = set(), []
    for u in raw:
        # dedupe on the image uuid (path segment before the size)
        key = u.rsplit("/", 2)[-2]
        if key not in seen:
            seen.add(key)
            imgs.append(u)
    if imgs:
        out["images"] = imgs

    # --- plain text for field extraction ---
    text = re.sub(r"<script.*?</script>", "", html, flags=re.S)
    text = re.sub(r"<style.*?</style>", "", text, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    m = re.search(r"Rent:\s*\$?([\d,]+)", text)
    if m:
        out["rent"] = int(m.group(1).replace(",", ""))
    m = re.search(r"Security Deposit:\s*\$?([\d,]+)", text)
    if m:
        out["deposit"] = int(m.group(1).replace(",", ""))
    m = re.search(r"Available\s+(Now|\d{1,2}/\d{1,2}/\d{2,4}|"
                  r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,2},?\s*\d{0,4})",
                  text)
    if m:
        out["available"] = m.group(1).strip()[:20]
    m = re.search(r"(\d+)\s*bd", text, re.I)
    if m:
        out["bedrooms"] = int(m.group(1))
    elif re.search(r"\bStudio\b", text):
        out["bedrooms"] = 0
    m = re.search(r"(\d+(?:\.\d+)?)\s*ba", text, re.I)
    if m:
        v = float(m.group(1))
        out["bathrooms"] = int(v) if v.is_integer() else v
    m = re.search(r"([\d,]{3,6})\s*(?:sq\.?\s*ft|ft\u00b2)", text, re.I)
    if m:
        out["sqft"] = int(m.group(1).replace(",", ""))
    # utilities included
    um = re.search(r"Utilities Included\s+([A-Za-z ]+?)(?:RENT|BED|Apply|Contact)", text)
    if um:
        out["utilities_included_list"] = um.group(1).strip()
    # phone
    pm = re.search(r"\((\d{3})\)\s*(\d{3})-(\d{4})", text)
    if pm:
        out["phone"] = f"({pm.group(1)}) {pm.group(2)}-{pm.group(3)}"
    # description: AppFolio "Description" section if present
    dm = re.search(r"Description\s+(.{30,1500}?)(?:Amenities|Rental Terms|Contact Us|Apply Now)", text)
    if dm:
        out["description"] = dm.group(1).strip()
    # amenities keywords
    am = []
    for kw, label in [(r"dishwasher", "dishwasher"), (r"laundry|washer", "laundry"),
                      (r"parking|garage", "parking"), (r"air condition|central air", "ac"),
                      (r"hardwood", "hardwood"), (r"pet", "pets_mentioned"),
                      (r"furnished", "furnished"), (r"balcony|patio|deck", "outdoor")]:
        if re.search(kw, text, re.I):
            am.append(label)
    if am:
        out["amenities_detected"] = am
    return out


def main(limit=None):
    listings = json.load(open(DB, encoding="utf-8"))
    cache = {}
    if CACHE.exists():
        cache = json.load(open(CACHE, encoding="utf-8"))

    targets = [l for l in listings
               if l["source"] in APPFOLIO_SOURCES
               and l.get("listing_info", {}).get("url")]
    if limit:
        targets = targets[:limit]
    logger.info(f"enriching {len(targets)} AppFolio listings "
                f"({len(cache)} cached)")

    done = 0
    for i, l in enumerate(targets):
        url = l["listing_info"]["url"]
        if url in cache:
            detail = cache[url]
        else:
            try:
                detail = parse_detail(fetch(url))
            except Exception as e:
                logger.warning(f"fail {url}: {e}")
                detail = {}
            cache[url] = detail
            time.sleep(0.6)
            if (i + 1) % 20 == 0:
                logger.info(f"  fetched {i + 1}/{len(targets)}")
                json.dump(cache, open(CACHE, "w", encoding="utf-8"), indent=2)

        if not detail:
            continue
        # merge
        if detail.get("images"):
            l["listing_info"]["images"] = detail["images"]
        if detail.get("rent"):
            l["pricing"]["monthly_rent_total"] = detail["rent"]
            br = l["housing"].get("bedrooms") or detail.get("bedrooms") or 1
            l["pricing"]["per_person_monthly"] = detail["rent"] // max(br, 1)
        if detail.get("deposit"):
            l["pricing"]["security_deposit"] = detail["deposit"]
        if detail.get("utilities_included_list"):
            l["pricing"]["utilities_included"] = True
            l["pricing"]["utilities_included_list"] = detail["utilities_included_list"]
        for k in ("bedrooms", "bathrooms", "sqft", "available"):
            if detail.get(k):
                l["housing"][k] = detail[k]
        if detail.get("description") and not l.get("description"):
            l["description"] = detail["description"]
        if detail.get("amenities_detected"):
            l.setdefault("amenities", {})
            for a in detail["amenities_detected"]:
                l["amenities"].setdefault(a, True)
        if detail.get("phone"):
            l.setdefault("contact", {})
            l["contact"].setdefault("phone", detail["phone"])
        done += 1

    json.dump(cache, open(CACHE, "w", encoding="utf-8"), indent=2)
    json.dump(listings, open(DB, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    tot_imgs = sum(len(d.get("images", [])) for d in cache.values())
    logger.info(f"done: enriched {done} listings | "
                f"{tot_imgs} total gallery images cached")


if __name__ == "__main__":
    import sys
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(lim)
