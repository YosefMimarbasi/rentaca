"""Verify EVERY listing. Writes data/_all_listings_audit.csv (one row per
listing: id, source, beds, baths, total, per_person, per_bed, address,
verdict) and prints the flag breakdown."""
import json
import re
import csv
import glob
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "apartments.json"
OUT = ROOT / "data" / "_all_listings_audit.csv"
PERBED = {"ithacarenting"}


def load_raw():
    out = {}
    for fn in glob.glob(str(ROOT / "data" / "raw" / "*_raw.json")):
        s = Path(fn).name.replace("_raw.json", "")
        try:
            for r in json.load(open(fn, encoding="utf-8")):
                out[f"{s}-{r.get('id')}"] = r
        except Exception:
            pass
    return out


def perbed_range(s):
    m = re.findall(r"\$?([\d,]{3,5})", s or "")
    return int(m[0].replace(",", "")) if m else 0


def main():
    d = json.load(open(DB, encoding="utf-8"))
    raw = load_raw()
    rows, fc = [], collections.Counter()
    for a in d:
        src = a.get("source")
        p = a.get("pricing", {}) or {}
        h = a.get("housing", {}) or {}
        t = p.get("monthly_rent_total", 0) or 0
        pp = p.get("per_person_monthly", 0) or 0
        b = h.get("bedrooms", 0) or 0
        ba = h.get("bathrooms", 0) or 0
        pb = round(t / b) if (t and b > 0) else (t if t else 0)
        r = raw.get(a.get("id"), {})
        iss = []
        if r and not p.get("price_basis"):
            rp = r.get("pricing", {}) or {}
            rt = rp.get("monthly_rent_total", 0) or 0
            if src in PERBED:
                rb = perbed_range(rp.get("price_range", "")) or rt
                if rb and abs(rb * max(b, 1) - t) > 2:
                    iss.append("IR_total_mismatch")
            elif rt and abs(rt - t) > 2 and "collegetownterrace" not in a.get("id", ""):
                iss.append("total!=raw")
        if t and pp and b > 0 and abs(pp - round(t / b)) > 2:
            iss.append("pp_inconsistent")
        if t and t < 400:
            iss.append("total<400")
        if pp and pp < 500:
            iss.append("pp<500")
        if pp and pp > 3500:
            iss.append("pp>3500")
        if b > 9 and not (t and 400 <= t / b <= 3000):
            iss.append("beds_implausible")
        if t and b > 0 and t / b < 350:
            iss.append("perbed<350")
        if not a.get("address") or not re.search(r"\d", a.get("address", "")):
            iss.append("no_addr")
        for i in iss:
            fc[i] += 1
        rows.append([a.get("id"), src, b, ba, t, pp, pb,
                     a.get("address", "")[:40], ";".join(iss) or "OK"])

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "source", "beds", "baths", "total", "per_person",
                    "per_bed", "address", "verdict"])
        w.writerows(rows)
    ok = sum(1 for r in rows if r[-1] == "OK")
    print(f"audited ALL {len(rows)} -> {OUT.name}")
    print(f"clean: {ok} | flagged: {len(rows)-ok}")
    for k, v in fc.most_common():
        print(f"  {k:20} {v}")


if __name__ == "__main__":
    main()
