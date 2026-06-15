"""Unify all listings into a building-centric model.

Three jobs:
  1. Normalize each listing's address into a stable *building key* (street
     number + street name, minus unit/apt suffixes, abbreviations expanded).
  2. Group every listing under its building so we know which units live in
     the same building (what CUAPTS lacks).
  3. Cross-link CUAPTS data (star ratings, reviews, owner website) onto
     matching listings from other sources, by building key.

Outputs:
  data/apartments.json  -- every listing, now carrying building_id and (if a
                           CUAPTS match exists) ratings/reviews/owner fields
  data/buildings.json   -- one record per building: aggregated address,
                           coordinates, owner/contact, ratings/reviews, the
                           union of all images, and the list of member units
                           with their individual pricing/beds/baths/images.
"""
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"
BUILDINGS = ROOT / "data" / "buildings.json"

STREET_ABBR = {
    r"\bst\b": "street", r"\bave\b": "avenue", r"\bav\b": "avenue",
    r"\brd\b": "road", r"\bdr\b": "drive", r"\bln\b": "lane",
    r"\bpl\b": "place", r"\bblvd\b": "boulevard", r"\bct\b": "court",
    r"\bter\b": "terrace", r"\bhwy\b": "highway", r"\bpkwy\b": "parkway",
    r"\bcir\b": "circle", r"\bsq\b": "square", r"\bn\b": "north",
    r"\bs\b": "south", r"\be\b": "east", r"\bw\b": "west",
}
# Tokens that signal a unit/apt designator -> everything after is dropped.
UNIT_SPLIT = re.compile(
    r"\b(?:unit|apt|apartment|suite|ste|#|room|rm|floor|fl)\b",
    re.I,
)


def normalize_building_key(address: str) -> str:
    """Return a normalized street-address key (no unit, no city/zip)."""
    if not address:
        return ""
    a = address.lower().strip()
    # Drop city/state/zip: keep only the part before the first comma, unless
    # the first comma is a unit (e.g. "319 Highland Road, 7A"). We handle the
    # unit case after, so cut at first comma is safe for the street portion.
    a = a.split(",")[0]
    # Remove explicit unit markers and trailing unit fragments.
    a = UNIT_SPLIT.split(a)[0]
    # " - 19" / " -  apt 1" style dash-unit suffixes.
    a = re.split(r"\s+-\s+", a)[0]
    # Strip anything after the street name that's clearly non-address noise
    # like "near kline" -> keep "114 overlook road".
    a = re.sub(r"\b(near|by|off|behind|next to)\b.*$", "", a)
    # Normalize punctuation/whitespace.
    a = a.replace(".", " ").replace("'", "")
    a = re.sub(r"[^a-z0-9 ]", " ", a)
    a = re.sub(r"\s+", " ", a).strip()
    # Expand street abbreviations.
    for pat, full in STREET_ABBR.items():
        a = re.sub(pat, full, a)
    a = re.sub(r"\s+", " ", a).strip()
    # Must start with a street number to be a usable building key.
    if not re.match(r"^\d", a):
        return ""
    # Collapse address ranges "125 127 n quarry" / "119-121" -> first number.
    a = re.sub(r"^(\d+)[\s-]+\d+\b", r"\1", a)
    return a


def extract_unit(address: str) -> str:
    """Best-effort unit/apt label from an address, for display."""
    if not address:
        return ""
    m = UNIT_SPLIT.search(address)
    if m:
        tail = address[m.end():].strip(" .,#-")
        return tail.split(",")[0].strip()[:12]
    m = re.search(r"\s-\s*([0-9A-Za-z]+)\b", address)
    if m:
        return m.group(1)[:12]
    # "319 Highland Road, 7A" -> 7A
    parts = [p.strip() for p in address.split(",")]
    if len(parts) >= 2 and re.match(r"^[0-9]{0,3}[A-Za-z]?$", parts[1]):
        return parts[1][:12]
    return ""


def main():
    listings = json.load(open(DB, encoding="utf-8"))

    # --- 1. assign building keys ---
    for l in listings:
        key = normalize_building_key(l.get("address", ""))
        l["building_key"] = key
        if not l.get("_unit"):
            l["_unit"] = extract_unit(l.get("address", ""))

    # --- 2. group ---
    groups = defaultdict(list)
    unmatched = []
    for l in listings:
        if l["building_key"]:
            groups[l["building_key"]].append(l)
        else:
            unmatched.append(l)

    # --- 3. build CUAPTS lookup for cross-linking ---
    cu_by_key = {}
    for key, members in groups.items():
        cu = [m for m in members if m["source"] == "cuapts"]
        if cu:
            # Prefer the one with most reviews.
            cu_by_key[key] = max(cu, key=lambda m: m.get("ratings", {}).get("num_reviews", 0))

    linked = 0
    for l in listings:
        if l["source"] == "cuapts":
            continue
        cu = cu_by_key.get(l["building_key"])
        if not cu:
            continue
        # Attach CUAPTS ratings/reviews if this listing lacks them.
        if cu.get("ratings", {}).get("num_reviews"):
            l.setdefault("ratings", cu["ratings"])
            l.setdefault("reviews", cu["reviews"])
            linked += 1
        # Attach owner website/company if missing.
        cuc = cu.get("contact", {})
        if cuc.get("owner_website") and not l.get("contact", {}).get("owner_website"):
            l.setdefault("contact", {})
            l["contact"]["owner_website"] = cuc["owner_website"]
        if cuc.get("company") and not l.get("contact", {}).get("company"):
            l.setdefault("contact", {})
            l["contact"]["company"] = cuc["company"]

    # --- 4. emit building records ---
    buildings = []
    for key, members in sorted(groups.items()):
        # Pick a canonical display address (longest non-unit street form).
        addr = max((m.get("address", "") for m in members), key=len)
        coords = next((m["coordinates"] for m in members
                       if m.get("coordinates", {}).get("lat")), {})
        cu = cu_by_key.get(key, {})
        # union of images across all members
        images = []
        for m in members:
            for img in m.get("listing_info", {}).get("images", []) or []:
                if img and img not in images:
                    images.append(img)
        # contact: prefer CUAPTS owner, else any member with company
        contact = {}
        if cu:
            contact = cu.get("contact", {})
        if not contact.get("company"):
            for m in members:
                if m.get("contact", {}).get("company"):
                    contact = {**contact, **m["contact"]}
                    break
        sources = sorted({m["source"] for m in members})
        units = []
        for m in members:
            if m["source"] == "cuapts":
                continue  # cuapts is building-level, not a rentable unit
            units.append({
                "id": m["id"],
                "source": m["source"],
                "unit": m.get("_unit", ""),
                "bedrooms": m.get("housing", {}).get("bedrooms", 0),
                "bathrooms": m.get("housing", {}).get("bathrooms", 0),
                "sqft": m.get("housing", {}).get("sqft", 0),
                "price": m.get("pricing", {}).get("monthly_rent_total", 0),
                "available": m.get("housing", {}).get("available", ""),
                "url": m.get("listing_info", {}).get("url", ""),
                "images": m.get("listing_info", {}).get("images", []),
            })
        buildings.append({
            "building_id": key.replace(" ", "-"),
            "building_key": key,
            "address": addr,
            "coordinates": coords,
            "area": cu.get("housing", {}).get("area", "") if cu else "",
            "contact": contact,
            "ratings": cu.get("ratings", {}) if cu else {},
            "reviews": cu.get("reviews", []) if cu else [],
            "travel_times": cu.get("travel_times", {}) if cu else {},
            "num_units": len(units),
            "sources": sources,
            "images": images,
            "units": units,
        })

    # attach building_id back to each listing
    key_to_id = {b["building_key"]: b["building_id"] for b in buildings}
    for l in listings:
        l["building_id"] = key_to_id.get(l["building_key"], "")

    json.dump(listings, open(DB, "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)
    json.dump(buildings, open(BUILDINGS, "w", encoding="utf-8"),
              indent=2, ensure_ascii=False)

    multi = [b for b in buildings if b["num_units"] > 1]
    rated = [b for b in buildings if b["ratings"].get("num_reviews")]
    print(f"listings: {len(listings)} | unmatched (no key): {len(unmatched)}")
    print(f"buildings: {len(buildings)} | multi-unit: {len(multi)} "
          f"| with ratings: {len(rated)}")
    print(f"cross-linked CUAPTS ratings onto {linked} non-cuapts listings")
    print("\nlargest buildings:")
    for b in sorted(buildings, key=lambda x: -x["num_units"])[:8]:
        print(f"  {b['num_units']:2}u  {b['address'][:42]:44} "
              f"{b['sources']}  {b['ratings'].get('num_reviews',0)}rev")


if __name__ == "__main__":
    main()
