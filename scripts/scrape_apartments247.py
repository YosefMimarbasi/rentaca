"""Browser scraper for apartments247-powered landlord sites (Playwright).

apartments247 renders client-side, so requests-based scraping fails. These
sites use standard routes (/gallery/, /floorplans/, /amenities/) we can
render and harvest. Produces per-community images split into room/gallery,
floorplan, and amenity buckets, keyed to the community's street address.

Currently configured for Lifestyle Properties (1073 Warren Rd community).
"""
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "raw" / "apartments247_images.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# community site -> list of street addresses it should fill (CUAPTS variants)
COMMUNITIES = {
    "https://www.lifestylepropertiesithaca.com": {
        # Lifestyle Properties manages these CUAPTS-listed communities
        # (Village Solars, Observatory Circle, etc.); the site's gallery/
        # amenity images are shared marketing across them.
        "addresses": ["1067 Warren Rd", "1073 Warren Road", "1 Sanctuary Dr",
                      "117 Village Cir", "Observatory Circle", "847 Dryden Rd"],
    },
}

IMG_RE = re.compile(r"\.(jpg|jpeg|png|webp)", re.I)


def page_images(pg, url):
    pg.goto(url, timeout=45000, wait_until="networkidle")
    pg.wait_for_timeout(3000)
    urls = pg.eval_on_selector_all(
        "img", "els => els.map(e => e.src || e.getAttribute('data-src')).filter(Boolean)")
    bg = pg.eval_on_selector_all(
        "*",
        "els => els.map(e => getComputedStyle(e).backgroundImage)"
        ".filter(s => s && s.indexOf('url(') === 0)")
    for s in bg:
        m = re.search(r"url\(['\"]?(https?://[^'\")]+)", s)
        if m:
            urls.append(m.group(1))
    out = []
    for u in urls:
        if IMG_RE.search(u) and "logo" not in u.lower() and "icon" not in u.lower():
            # apts247 thumbnails come in size folders; keep as-is
            out.append(u)
    # dedup by image id (strip size path segment)
    seen, ded = set(), []
    for u in out:
        k = re.sub(r"/\d+x\d+", "", re.sub(r"[?#].*$", "", u))
        if k in seen:
            continue
        seen.add(k)
        ded.append(u)
    return ded


def main():
    result = {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--disable-blink-features=AutomationControlled"])
        ctx = b.new_context(user_agent=UA, ignore_https_errors=True,
                            viewport={"width": 1366, "height": 900})
        pg = ctx.new_page()
        for base, meta in COMMUNITIES.items():
            buckets = {"images": [], "floorplan_images": [], "amenity_images": []}
            try:
                buckets["images"] = page_images(pg, base + "/gallery/")
            except Exception as e:
                print("gallery ERR", e)
            try:
                buckets["floorplan_images"] = page_images(pg, base + "/floorplans/")
            except Exception as e:
                print("floorplans ERR", e)
            try:
                buckets["amenity_images"] = page_images(pg, base + "/amenities/")
            except Exception as e:
                print("amenities ERR", e)
            for addr in meta["addresses"]:
                result[addr] = buckets
            print(f"{base}: gallery={len(buckets['images'])} "
                  f"floorplans={len(buckets['floorplan_images'])} "
                  f"amenities={len(buckets['amenity_images'])}")
        b.close()

    OUT.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
