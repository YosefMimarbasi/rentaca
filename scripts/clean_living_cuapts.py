"""Remove non-living-space listings and eliminate CUAPTS as a source.

  1. Drop true non-living rentals (garage/workshop/storage/commercial whose
     listing IS that, not an apartment mentioning it).
  2. CUAPTS rows:
       - shared with a real source in the same building -> drop the review
         stub (its ratings/reviews already cross-link to the real sibling +
         building during unify).
       - cuapts-only -> relabel source to the actual landlord/company (the
         real original source), keeping ratings/reviews.
   After this, no row has source == "cuapts".
"""
import json
import re
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"

SUBJ = re.compile(r"\b(garage|parking (spot|space|spaces)|storage (unit|space)|"
                  r"workshop|commercial (space|property|unit)|office space|"
                  r"retail|warehouse|land for rent)\b", re.I)
LIVE = re.compile(r"\b(apartment|bedroom|studio|\d\s*br\b|\d\s*bed|house|home|"
                  r"loft|flat|unit|efficiency|sublet|room)\b", re.I)


def slug_company(name):
    return re.sub(r"\s+", " ", name).strip()


def main():
    d = json.load(open(DB, encoding="utf-8"))
    byb = collections.defaultdict(list)
    for a in d:
        if a.get("building_id"):
            byb[a["building_id"]].append(a)

    keep = []
    nonliving = cu_dropped = cu_relabeled = 0
    for a in d:
        t = a.get("title", "") or ""
        # 1. non-living
        if SUBJ.search(t) and not LIVE.search(t):
            nonliving += 1
            continue
        # 2. cuapts
        if a.get("source") == "cuapts":
            members = byb.get(a.get("building_id"), [])
            reals = [m for m in members if m.get("source") not in ("cuapts", None)]
            if reals:
                # transfer reviews/ratings to the richest real sibling, then drop
                rv = a.get("ratings", {}) or {}
                if rv.get("num_reviews"):
                    sib = max(reals, key=lambda m: (len((m.get("listing_info", {}) or {}).get("images", []) or [])))
                    sib.setdefault("ratings", a.get("ratings"))
                    sib.setdefault("reviews", a.get("reviews", []))
                    sib["_review_source"] = True
                cu_dropped += 1
                continue
            co = (a.get("contact", {}) or {}).get("company") or \
                 (a.get("contact", {}) or {}).get("name")
            a["source"] = slug_company(co) if co else "ithaca-listing"
            a["_review_source"] = True  # flag so unify still pulls its reviews
            cu_relabeled += 1
        keep.append(a)

    json.dump(keep, open(DB, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"non-living removed:     {nonliving}")
    print(f"cuapts stubs dropped:   {cu_dropped}")
    print(f"cuapts relabeled->landlord: {cu_relabeled}")
    print(f"listings: {len(d)} -> {len(keep)}")
    print(f"remaining source=='cuapts': "
          f"{sum(1 for a in keep if a.get('source')=='cuapts')}")


if __name__ == "__main__":
    main()
