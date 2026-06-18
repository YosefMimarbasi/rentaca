"""General data cleaning pass over apartments.json.

  1. Addresses: collapse whitespace, strip stray/leading/trailing commas,
     title-case obvious all-lower/UPPER, ensure ", Ithaca, NY" tail sanity.
  2. Titles: strip craigslist "$1,200 / 3br - 1000ft2 - " price/size prefix;
     drop empty/garbage titles -> fall back to address.
  3. Baths: a bath count more than beds+2 (with beds>0) is a misparse -> 0.
  4. De-duplicate: identical (source, normalized address, beds, baths, total)
     rows collapse to the single richest record (most images/longest desc).
  5. Trim description whitespace.

Building grouping (building_id) is preserved; cross-source rows are kept
(they add reviews/extra data) -- only same-source exact dups are removed.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"


def clean_addr(s):
    if not s:
        return s
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*,\s*", ", ", s)
    s = re.sub(r"(,\s*)+,", ", ", s)
    s = re.sub(r"^[,\s]+|[,\s]+$", "", s)
    s = re.sub(r"(,\s*ithaca,\s*ny)(\s*,?\s*ithaca,\s*ny)+", r"\1", s, flags=re.I)
    return s


def clean_title(t, addr, beds):
    t = (t or "").strip()
    # strip craigslist "$1,200 / 3br - 1000ft2 - " style prefix
    t = re.sub(r"^\$[\d,]+\s*/?\s*\d*\s*br\s*-\s*\d*\s*ft2?\s*-\s*", "", t, flags=re.I)
    t = re.sub(r"^\$[\d,]+\s*[-/]?\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    # garbage / too short -> use address
    if len(t) < 4 or re.search(r"^(back to|prices listed|bedrooms?\s+\d)", t, re.I):
        t = addr or t
    return t


def richness(a):
    li = a.get("listing_info", {}) or {}
    return (len(li.get("images", []) or []) + len(li.get("images_from_building", []) or []),
            len(a.get("description", "") or ""))


def main():
    d = json.load(open(DB, encoding="utf-8"))
    fixed_addr = fixed_title = fixed_bath = 0

    for a in d:
        h = a.get("housing", {}) or {}
        na = clean_addr(a.get("address", ""))
        if na != a.get("address"):
            a["address"] = na
            fixed_addr += 1
        nt = clean_title(a.get("title", ""), na, h.get("bedrooms", 0))
        if nt != a.get("title"):
            a["title"] = nt
            fixed_title += 1
        bd = h.get("bedrooms", 0) or 0
        ba = h.get("bathrooms", 0) or 0
        if bd > 0 and ba > bd + 2:
            h["bathrooms"] = 0
            fixed_bath += 1
        if a.get("description"):
            a["description"] = re.sub(r"\s+", " ", a["description"]).strip()

    # de-dup same-source identical rows (keep richest)
    groups = {}
    for a in d:
        key = (a.get("source"),
               (a.get("address", "") or "").lower(),
               a.get("housing", {}).get("bedrooms"),
               a.get("housing", {}).get("bathrooms"),
               a.get("pricing", {}).get("monthly_rent_total"))
        groups.setdefault(key, []).append(a)
    keep = []
    removed = 0
    for key, rows in groups.items():
        if len(rows) == 1 or not key[1] or not key[4]:
            keep.extend(rows)
            continue
        rows.sort(key=richness, reverse=True)
        keep.append(rows[0])
        removed += len(rows) - 1

    json.dump(keep, open(DB, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"addresses normalized: {fixed_addr}")
    print(f"titles cleaned:       {fixed_title}")
    print(f"bad baths zeroed:     {fixed_bath}")
    print(f"duplicate rows removed:{removed}")
    print(f"listings: {len(d)} -> {len(keep)}")


if __name__ == "__main__":
    main()
