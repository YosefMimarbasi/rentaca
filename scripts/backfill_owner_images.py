"""Backfill images for image-less buildings from their owner websites.

Targets the CUAPTS-only buildings that no scraped source photographed, by
fetching the landlord's own site and matching by street address. Only sites
that are reachable and serve static images are handled; blocked sites
(Certified 403, Conifer 403, Mazza 500) are skipped and reported.
"""
import json
import re
import ssl
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
        return r.read().decode("utf-8", "ignore")


def dedup(urls):
    seen, out = set(), []
    for u in urls:
        k = re.sub(r"[?#].*$", "", u)
        k = re.sub(r"~mv2.*$", "", k)
        if k in seen:
            continue
        seen.add(k)
        out.append(u)
    return out


def wixstatic(html):
    imgs = re.findall(
        r"https://static\.wixstatic\.com/media/[A-Za-z0-9_~%.\-]+\."
        r"(?:jpg|jpeg|png|webp)", html)
    return dedup([u for u in imgs if "logo" not in u.lower()])


def squarespace(html):
    imgs = re.findall(r"https://images\.squarespace-cdn\.com/[^\"' )]+", html)
    imgs = [i for i in imgs if "/content/" in i and "logo" not in i.lower()]
    # request a reasonable size
    out = []
    for i in imgs:
        i = re.sub(r"\?.*$", "", i) + "?format=1500w"
        out.append(i)
    return dedup(out)


def generic_imgs(html, host_filter=None):
    imgs = re.findall(r"https?://[^\"' )]+\.(?:jpg|jpeg|png|webp)", html, re.I)
    out = [u for u in imgs if "logo" not in u.lower() and "icon" not in u.lower()]
    if host_filter:
        out = [u for u in out if host_filter in u]
    return dedup(out)


def gather():
    """Return {target_address: [image_urls]} for reachable owner sites."""
    targets = {}

    # 118 College Ave (Wix) -- the site IS the building.
    try:
        targets["118 College Avenue"] = wixstatic(fetch("https://www.118collegeave.com/"))
    except Exception as e:
        print("118college ERR", e)

    # West Shore -- only 921 Taughannock has its own page.
    try:
        targets["921 Taughannock Blvd"] = squarespace(
            fetch("https://www.westshoreapts.com/921-taughannock-boulevard"))
    except Exception as e:
        print("westshore ERR", e)

    # Kimball -- Westbourne page (low yield but real).
    try:
        targets["120-126 Westbourne Lane"] = generic_imgs(
            fetch("http://www.kimballrentals.com/westbourne-apartments.html"),
            host_filter="kimballrentals.com")
    except Exception as e:
        print("kimball ERR", e)

    return {k: v for k, v in targets.items() if v}


def norm(addr):
    a = (addr or "").lower()
    a = re.sub(r"[.,].*", "", a)
    a = re.sub(r"\b(boulevard|blvd)\b", "blvd", a)
    a = re.sub(r"\b(avenue|ave|av)\b", "ave", a)
    a = re.sub(r"\b(street|st)\b", "st", a)
    a = re.sub(r"\b(road|rd)\b", "rd", a)
    a = re.sub(r"\b(lane|ln)\b", "lane", a)
    a = re.sub(r"[^a-z0-9 ]", " ", a)
    a = re.sub(r"\s+", " ", a).strip()
    return a


def load_apts247():
    """Load Playwright-scraped apartments247 community images, if present.

    Returns {normalized_address: {"images": [...], "floorplan_images": [...]}}.
    Filters loader/placeholder assets.
    """
    path = ROOT / "data" / "raw" / "apartments247_images.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    bad = ("img-loading", "placeholder", "spacer", "blank")
    out = {}
    for addr, buckets in raw.items():
        def clean(key):
            return [u for u in buckets.get(key, []) if not any(b in u.lower() for b in bad)]
        gallery = dedup(clean("images") + clean("amenity_images"))
        fps = dedup(clean("floorplan_images"))
        out[norm(addr)] = {"images": gallery, "floorplan_images": fps}
    return out


def main():
    targets = gather()
    print("gathered owner images for:")
    for k, v in targets.items():
        print(f"  {k:30} {len(v)} images")
    tnorm = {norm(k): v for k, v in targets.items()}
    a247 = load_apts247()
    if a247:
        print("apartments247 communities:")
        for k, v in a247.items():
            print(f"  {k:30} gallery+amenity={len(v['images'])} floorplans={len(v['floorplan_images'])}")

    db = json.load(open(DB, encoding="utf-8"))
    filled = 0
    for l in db:
        info = l.setdefault("listing_info", {})
        n = norm(l.get("address"))
        changed = False
        # simple owner-site galleries
        if not info.get("images") and n in tnorm:
            info["images"] = list(tnorm[n])
            changed = True
        # apartments247 communities (gallery/amenity + floorplans)
        if n in a247:
            if not info.get("images") and a247[n]["images"]:
                info["images"] = list(a247[n]["images"])
                changed = True
            if a247[n]["floorplan_images"]:
                existing = info.get("floorplan_images", []) or []
                info["floorplan_images"] = dedup(existing + a247[n]["floorplan_images"])
                changed = True
        if changed:
            filled += 1
            print(f"  filled {l.get('source')}: {l.get('address')}")

    print(f"\nfilled {filled} listings")
    import sys
    if "--write" in sys.argv:
        json.dump(db, open(DB, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print("WROTE", DB)
    else:
        print("(dry run -- pass --write)")


if __name__ == "__main__":
    main()
