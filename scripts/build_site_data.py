#!/usr/bin/env python3
"""
build_site_data.py — produce a slim, frontend-optimized dataset for the Rentaca website.

apartments.json is the source of truth for UNITS (1,099 of them). buildings.json
carries the rich building layer (ratings, reviews, shared galleries, contact,
travel_times) but its units[] arrays are stale, so we GROUP units from
apartments.json by building_id and ENRICH each group with the building metadata.

Apartments with no building_id become standalone single-unit buildings.

Emits data/site.json. Run from the repo root:  python scripts/build_site_data.py
"""
import json
import math
import re
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

CORNELL = (42.4534, -76.4735)
ITHACA_COLLEGE = (42.4220, -76.4954)

# Geocoders fall back to the Ithaca city centroid when they can't resolve a
# vague address ("Ithaca", "South Hill", "Village Circle"). 60+ listings land on
# this exact point, producing a fake-precise "1.47 mi to Cornell". Detect it and
# suppress the bogus distance rather than implying precision we don't have.
CITY_CENTROID = (42.4406, -76.4966)
CENTROID_TOL = 0.0008


def is_centroid(lat, lng):
    return (lat is not None and lng is not None
            and abs(lat - CITY_CENTROID[0]) < CENTROID_TOL
            and abs(lng - CITY_CENTROID[1]) < CENTROID_TOL)


def haversine_mi(a, b):
    if not (a[0] and a[1] and b[0] and b[1]):
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(3958.8 * 2 * math.asin(math.sqrt(h)), 2)


def dedupe(seq):
    seen, out = set(), []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "listing"


def title_address(addr):
    """Tidy an address for display (collapse whitespace, strip stray leading commas)."""
    a = re.sub(r"\s+", " ", (addr or "").strip())
    a = re.sub(r"^[,\s]+", "", a)            # drop leading comma/space
    a = re.sub(r"\s*,\s*,\s*", ", ", a)       # collapse double commas
    return a.strip()


# A single residential unit with more bedrooms than this is almost certainly a
# bad parse (a street number captured as a bedroom count). Cap to keep the UI
# and per-person math honest.
MAX_PLAUSIBLE_BEDS = 12

# A real bedroom needs roughly this many sqft. When sqft/beds falls below it the
# bedroom COUNT is wrong (a street number misparsed), not the apartment tiny —
# e.g. "176 sqft / 10 beds". Catches misparses that sit under the 12-bed cap.
MIN_SQFT_PER_BED = 90

# Plausible Ithaca student per-person monthly rent. Outside this band the figure
# is a misparse: per-room rent mislabeled as total, or a total divided by a bad
# bed count ($595 / "10 beds" = $59). Studios push the ceiling (pp == whole rent).
PP_MIN, PP_MAX = 280, 5200


def sane_beds(bd, sqft=None):
    if not (isinstance(bd, (int, float)) and 0 <= bd <= MAX_PLAUSIBLE_BEDS):
        return None
    if bd >= 1 and isinstance(sqft, (int, float)) and sqft > 0 \
            and sqft / bd < MIN_SQFT_PER_BED:
        return None
    return bd


def sane_pp(pp, rent=None, beds=None):
    """Per-person rent we trust. Accept source pp if it sits in the plausible
    band; else try to recompute from a clean total rent and bed count; else None
    (the card falls back to showing total $/mo, which stays honest)."""
    if isinstance(pp, (int, float)) and PP_MIN <= pp <= PP_MAX:
        return int(round(pp))
    if isinstance(rent, (int, float)) and rent > 0 \
            and isinstance(beds, (int, float)) and beds >= 1:
        cand = rent / beds
        if PP_MIN <= cand <= PP_MAX:
            return int(round(cand))
    return None


def main():
    apts = json.loads((DATA / "apartments.json").read_text(encoding="utf-8"))
    blds = json.loads((DATA / "buildings.json").read_text(encoding="utf-8"))
    bmeta = {b["building_id"]: b for b in blds if b.get("building_id")}

    # ---- group apartments by building_id (synthesize for blanks) ----
    groups = {}  # bid -> list[apt]
    for a in apts:
        bid = a.get("building_id") or ("u-" + slugify(a["id"]))
        groups.setdefault(bid, []).append(a)

    out_buildings = []
    for bid, members in groups.items():
        meta = bmeta.get(bid, {})
        units_out = []
        prices, pps, beds, baths = [], [], [], []
        dist_cornell, dist_ic = [], []
        am = {"parking": False, "laundry": False, "ac": False,
              "furnished": False, "cats": False, "dogs": False}
        floorplans, own_images = [], []
        addresses = []

        for a in members:
            pricing = a.get("pricing", {})
            amen = a.get("amenities", {})
            housing = a.get("housing", {})
            li = a.get("listing_info", {})

            price = pricing.get("monthly_rent_total") or 0
            bd = sane_beds(housing.get("bedrooms"), housing.get("sqft"))
            ba = housing.get("bathrooms")

            # Validate per-person rent on its own plausible band (and recompute
            # from clean rent/beds when the source figure is garbage). This keeps
            # legit high-pp figures for big complexes while killing $59/person
            # misparses, without coupling pp-trust to the bed-count cap.
            pp = sane_pp(pricing.get("per_person_monthly"), price, bd)

            u_imgs = dedupe((li.get("images") or []) + (li.get("images_from_building") or []))
            u_fps = dedupe(li.get("floorplan_images") or [])
            floorplans += u_fps
            own_images += (li.get("images") or [])
            if a.get("address"):
                addresses.append(a["address"])

            if price:
                prices.append(price)
            if pp:
                pps.append(pp)
            if isinstance(bd, (int, float)):
                beds.append(bd)
            if isinstance(ba, (int, float)) and ba:
                baths.append(ba)
            if a.get("distance_to_cornell_miles"):
                dist_cornell.append(a["distance_to_cornell_miles"])
            if a.get("distance_to_ithaca_college_miles"):
                dist_ic.append(a["distance_to_ithaca_college_miles"])

            if amen.get("parking") and amen["parking"] != "none":
                am["parking"] = True
            if amen.get("laundry"):
                am["laundry"] = True
            if amen.get("air_conditioning"):
                am["ac"] = True
            if housing.get("furnished") or amen.get("furnished"):
                am["furnished"] = True
            if amen.get("cats_ok"):
                am["cats"] = True
            if amen.get("dogs_ok"):
                am["dogs"] = True

            units_out.append({
                "id": a.get("id"),
                "unit": (a.get("_unit") or "").strip(),
                "title": title_address(a.get("title")),
                "beds": bd if isinstance(bd, (int, float)) else None,
                "baths": ba if ba else None,
                "sqft": housing.get("sqft") or None,
                "price": price or None,
                "pp": pp or None,
                "est": pricing.get("price_basis") == "building median",
                "available": (housing.get("available") or "").strip(),
                "furnished": bool(housing.get("furnished") or amen.get("furnished")),
                "parking": amen.get("parking") if amen.get("parking") and amen.get("parking") != "none" else None,
                "laundry": amen.get("laundry") or None,
                "ac": bool(amen.get("air_conditioning")),
                "cats": bool(amen.get("cats_ok")),
                "dogs": bool(amen.get("dogs_ok")),
                "deposit": pricing.get("security_deposit") or None,
                "utilities": bool(pricing.get("utilities_included")),
                "source": a.get("source"),
                "url": li.get("url") or "",
                "images": u_imgs[:24],
                "floorplans": u_fps[:6],
            })

        # building-level coords: meta first, else any member's
        coords = meta.get("coordinates") or {}
        lat, lng = coords.get("lat"), coords.get("lng")
        if not (lat and lng):
            for a in members:
                c = a.get("coordinates") or {}
                if c.get("lat") and c.get("lng"):
                    lat, lng = c["lat"], c["lng"]
                    break

        # If the only location we have is the city-centroid geocoder fallback,
        # we don't actually know where this listing is — don't fabricate a
        # precise distance. The precomputed distance_to_*_miles on these records
        # was ITSELF derived from the centroid, so it's equally fake; suppress it
        # too and just flag the location approximate.
        approx = is_centroid(lat, lng)

        if approx:
            dc = di = None
        else:
            dc = min(dist_cornell) if dist_cornell else haversine_mi((lat, lng), CORNELL)
            di = min(dist_ic) if dist_ic else haversine_mi((lat, lng), ITHACA_COLLEGE)

        # images: building shared gallery (meta) unioned with members' own photos
        images = dedupe((meta.get("images") or []) + own_images)

        ratings = meta.get("ratings") or {}
        contact = meta.get("contact") or {}
        tt = meta.get("travel_times") or {}
        walk = tt.get("engQuadWalking") or tt.get("agQuadWalking") or tt.get("hoPlazaWalking")
        drive = tt.get("engQuadDriving") or tt.get("agQuadDriving") or tt.get("hoPlazaDriving")

        # canonical display address: building meta, else most common member address
        addr = title_address(meta.get("address")) or title_address(
            max(set(addresses), key=addresses.count) if addresses else "Ithaca, NY")
        if not addr or addr in (",", "Ithaca, NY", "NY"):
            addr = title_address(meta.get("address")) or "Ithaca, NY"

        area = (meta.get("area") or "").strip()

        # order units: priced + bedded first, cheapest $/person first
        units_out.sort(key=lambda u: (0 if u["pp"] else 1, u["pp"] or u["price"] or 1e9))

        sources = dedupe((meta.get("sources") or []) + [a.get("source") for a in members])

        out_buildings.append({
            "id": bid,
            "address": addr,
            "area": area,
            "lat": lat, "lng": lng,
            "img": images[0] if images else "",
            "images": images[:18],
            "floorplans": dedupe(floorplans)[:12],
            "num_units": len(units_out),
            "price_min": min(prices) if prices else None,
            "price_max": max(prices) if prices else None,
            "pp_min": min(pps) if pps else None,
            "pp_max": max(pps) if pps else None,
            "beds_min": int(min(beds)) if beds else None,
            "beds_max": int(max(beds)) if beds else None,
            "baths_max": max(baths) if baths else None,
            "dist_cornell": dc,
            "dist_ic": di,
            "approx_loc": bool(approx),
            "walk_min": round(walk) if walk else None,
            "drive_min": round(drive) if drive else None,
            "amenities": am,
            "rating": round(ratings["avg_rating"], 1) if ratings.get("avg_rating") is not None else None,
            "num_reviews": ratings.get("num_reviews") or len(meta.get("reviews") or []),
            "category_averages": ratings.get("category_averages") or {},
            "company": contact.get("company") or "",
            "phone": contact.get("phone") or "",
            "website": contact.get("website") or "",
            "email": contact.get("email") or "",
            "sources": sources,
            "reviews": [{
                "date": (r.get("date") or "")[:10],
                "rating": r.get("overall_rating"),
                "text": r.get("text") or "",
                "likes": r.get("likes") or 0,
                "detailed": r.get("detailed_ratings") or {},
            } for r in (meta.get("reviews") or []) if r.get("text")],
            # slim per-unit rows for the building detail table (drop the heavy
            # per-unit image/floorplan arrays — the page renders building-level
            # galleries, and the table only needs these scalar fields)
            "units": [{k: u[k] for k in (
                "id", "unit", "title", "beds", "baths", "sqft", "price", "pp",
                "est", "available", "furnished", "parking", "laundry", "ac",
                "utilities", "source", "url",
            )} for u in units_out],
            "_has_photo": bool(images),
        })

    # sort: priced+photographed buildings first, then rating, then more units
    def sort_key(b):
        priced = 1 if b["pp_min"] else 0
        return (
            -(priced and b["_has_photo"]),
            -(b["rating"] or 0),
            (b["pp_min"] or 9e9),
            -(b["num_units"] or 0),
        )
    out_buildings.sort(key=sort_key)
    for b in out_buildings:
        b.pop("_has_photo", None)

    total_units = sum(b["num_units"] for b in out_buildings)
    all_sources = dedupe([s for b in out_buildings for s in b["sources"]])
    all_pps = sorted([b["pp_min"] for b in out_buildings if b["pp_min"]])

    payload = {
        "generated": date.today().isoformat(),
        "stats": {
            "buildings": len(out_buildings),
            "multi_unit": len([b for b in out_buildings if b["num_units"] > 1]),
            "units": total_units,
            "sources": len(all_sources),
            "source_list": all_sources,
            "with_reviews": len([b for b in out_buildings if b["num_reviews"]]),
            "with_photos": len([b for b in out_buildings if b["img"]]),
            "areas": sorted({b["area"] for b in out_buildings if b["area"]}),
            "median_pp": int(all_pps[len(all_pps) // 2]) if all_pps else None,
        },
        "buildings": out_buildings,
    }

    out_path = DATA / "site.json"
    out_path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    s = payload["stats"]
    print(f"Wrote {out_path}  ({out_path.stat().st_size / 1e6:.2f} MB)")
    print(f"  buildings: {s['buildings']} (multi-unit {s['multi_unit']}) | units: {s['units']}")
    print(f"  photos: {s['with_photos']} | reviews: {s['with_reviews']} | sources: {s['sources']} | median $/person: {s['median_pp']}")


if __name__ == "__main__":
    main()
