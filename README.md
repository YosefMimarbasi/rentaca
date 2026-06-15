# Rentica - Ithaca Apartment Database

A comprehensive, student-friendly apartment and housing database for Ithaca, NY. This project aggregates rental information from multiple sources to help students find housing that meets their needs.

## Project Goal

Create the most complete apartment database for Ithaca by scraping and aggregating data from all available online sources.

### Sources currently scraped

| Source | Method | Notes |
|--------|--------|-------|
| **Craigslist** (apts, rooms, sublets) | full detail-page scrape | Largest source; geo-coordinates, photos, amenities |
| **PPM Homes** | AppFolio listings portal | Live rents, bed/bath |
| **Travis Hyde Properties** | AppFolio listings portal | Live rents; manages **Eddygate** & **Seneca Way** |
| **Modern Living Rentals** | AppFolio listings portal | Large Collegetown portfolio |
| **Lambrou Real Estate** | Squarespace JSON API | Collegetown buildings |
| **Ithaca Estates Realty** | server-rendered detail pages | Multi-unit buildings |
| **Strawberry Property** | WordPress detail pages | Student houses |
| **Ridgetop** | Squarespace building pages | Eddy St / Dryden Rd |

AppFolio portals are discovered automatically and share one scraper
(`scrape_appfolio.py`); add a portal to `APPFOLIO_PORTALS` to include it.

### Sources investigated but not (yet) scrapable

| Source | Platform | Blocker |
|--------|----------|---------|
| apartments.com, Zillow | — | HTTP 403 anti-bot |
| Collegetown Terrace | — | HTTP 403 |
| Ithaca Renting Company | RentManager | HTML doesn't expose per-unit address/price; portal is JS-only |
| Lux & Lofts | Entrata | client-side rendered |
| Cayuga Place | RealPage | client-side rendered |
| Harold's Square | Buildium | client-side rendered |
| Heritage Park | greatcommunities portal | external portal |

To add a source, subclass `BaseScraper` in `scripts/` and register it in
`build_database.py`.

## Data Included

For each listing, we collect:

### Location & Building Info
- Full address with GPS coordinates
- Distance to Cornell/Ithaca College
- Neighborhood/area
- Building age and condition
- Property type (apartment, house, dorm, etc.)

### Housing Details
- Number of bedrooms
- Number of bathrooms
- Total square footage
- Floor level
- Furnished/unfurnished

### Pricing
- Monthly rent (total)
- Cost per person per month
- Lease term options
- Security deposit
- Pet deposits/fees
- Utility costs (if available)
- Internet included (yes/no)

### Amenities
- Parking (yes/no, type, cost)
- Laundry (in-unit, in-building, off-site)
- Air conditioning
- Heating type
- Kitchen appliances
- Dishwasher
- Balcony/patio
- Basement/storage
- Garden/outdoor space

### Tenant Requirements
- Lease length options
- Move-in date
- Pet policy (species, size limits, fees)
- Income requirements
- Credit score requirements
- Background check requirements
- Guarantor/co-signer requirements

### Logistics
- Listing posted date
- Last updated date
- Contact information (name, phone, email)
- Landlord/management company
- Application requirements
- Application fees
- Showing schedule

### Images & Virtual Tours
- Photo URLs
- Virtual tour links
- 3D maps
- Neighborhood photos

## Data Format

All data is stored in JSON format in the `/data` directory:
- `apartments.json` - Main comprehensive database
- Source-specific files for raw data before normalization

### Sample Entry

```json
{
  "id": "apt-12345",
  "source": "craigslist",
  "title": "3BR/2BA apartment near Commons",
  "description": "Spacious apartment with modern kitchen",
  "address": "123 Main St, Ithaca, NY 14850",
  "coordinates": {
    "lat": 42.4534,
    "lng": -76.4735
  },
  "housing": {
    "type": "apartment",
    "bedrooms": 3,
    "bathrooms": 2,
    "sqft": 1200,
    "furnished": false,
    "floor": 2
  },
  "pricing": {
    "monthly_rent_total": 2100,
    "per_person_monthly": 700,
    "security_deposit": 2100,
    "utilities_included": false,
    "internet_included": true
  },
  "amenities": {
    "parking": "street",
    "parking_cost": 0,
    "laundry": "in-building",
    "ac": true,
    "heating": "forced-air",
    "dishwasher": false,
    "balcony": false
  },
  "requirements": {
    "lease_length_months": 12,
    "move_in_date": "2024-08-15",
    "pets_allowed": true,
    "pet_types": ["dogs", "cats"],
    "pet_size_limit_lbs": 50,
    "min_income_multiplier": 40
  },
  "contact": {
    "landlord_name": "John Smith",
    "phone": "607-XXX-XXXX",
    "email": "john@example.com",
    "company": "Smith Properties"
  },
  "listing_info": {
    "posted_date": "2024-06-01",
    "last_updated": "2024-06-15",
    "url": "https://...",
    "images": ["url1", "url2"]
  },
  "distance_to_cornell_miles": 1.5,
  "distance_to_ithaca_college_miles": 2.0
}
```

## Directory Structure

```
rentica/
├── README.md                 # This file
├── index.html                # Interactive web UI (map + filters)
├── data/
│   ├── apartments.json       # Main comprehensive database
│   └── raw/                  # Raw data from each source
│       ├── craigslist_raw.json
│       ├── lambrou_raw.json
│       ├── ithacaestates_raw.json
│       ├── ppmhomes_raw.json
│       └── travishyde_raw.json
├── scripts/
│   ├── scraper_base.py       # Base class for all scrapers
│   ├── scrape_craigslist.py  # Craigslist (full detail pages)
│   ├── scrape_lambrou.py     # Lambrou (Squarespace JSON)
│   ├── scrape_ithacaestates.py
│   ├── scrape_appfolio.py    # PPM Homes + Travis Hyde (AppFolio)
│   ├── normalize_data.py     # Standardize + deduplicate
│   ├── geocode.py            # Coordinates + distances to campuses
│   └── build_database.py     # Run all sources end-to-end
├── tools/
│   ├── search.py             # Query the database (CLI)
│   └── analyze.py            # Generate statistics
├── requirements.txt
└── .gitignore
```

## How to Use This Data

### Interactive web interface (recommended)
Open `index.html` in a browser (or serve the folder) to browse every listing
on a map with live filters for price-per-person, bedrooms, bathrooms,
distance to Cornell, parking, laundry, A/C, furnished, and pets:
```
python -m http.server 8000      # then visit http://localhost:8000
```

### Search by Filters (CLI)
```
python tools/search.py --max-price 800 --bedrooms 2 --parking
```

### View Statistics
```
python tools/analyze.py --neighborhood collegetown
```

### Rebuild the database
```
pip install -r requirements.txt
python scripts/build_database.py
```

### Access the JSON
All data is available in structured JSON format (`data/apartments.json`)
for direct analysis.

## Contributing

Found a missing listing? Have data to add? Create an issue or submit a pull request.

## Data Accuracy

Last comprehensive scrape: [DATE]
- Total listings: [COUNT]
- Date range: [START] to [END]

Note: This data is aggregated from public sources. Always verify current information with landlords before applying.

## Legal

This project collects publicly available information. All data is provided as-is. Users should verify all information directly with landlords and conduct proper due diligence before signing leases.
