# Truck Deal Finder

Find the best deals on new Toyota Tundras and Ford F-150s near San Diego.

## Features

- Scrapes multiple sources for listings (Cars.com, CarGurus, Autotrader)
- SQLite database tracks listings and price changes
- Detects and alerts on price drops
- Generates HTML report with all deals
- Email templates for contacting dealers

## Data Source Status

| Source | Status | Notes |
|--------|--------|-------|
| Cars.com | Working | Primary source, most reliable |
| CarGurus | Blocked | Enterprise bot protection (Selenium + undetected-chromedriver attempted) |
| Autotrader | Blocked | Enterprise bot protection |

**Note:** CarGurus and Autotrader have enterprise-level bot detection that blocks even undetected-chromedriver. These sites invest heavily in anti-scraping because their business model depends on being the intermediary. Options to bypass:
- Residential proxy services (paid)
- CAPTCHA solving services (paid)
- Manual browser sessions with cookie export
- Their official APIs (if available)

## Setup

1. Install Python 3.10+

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Edit `deal_finder.py` to customize:
   - `CONFIG["zip_code"]` - Your ZIP code
   - `CONFIG["radius"]` - Search radius in miles
   - `CONFIG["vehicles"]` - Makes/models to search
   - `EMAIL_CONFIG` - Your contact info for emails

## Usage

### Full Scrape + Report
```bash
python deal_finder.py
```
Scrapes all sources, updates database, and generates HTML report.

### Report Only
```bash
python deal_finder.py --report-only
```
Regenerates HTML report from existing database without scraping.

### Show Price Drops
```bash
python deal_finder.py --drops
```
Shows price drops from the last 7 days.

### Show Best Deals
```bash
python deal_finder.py --best
```
Shows top 5 cheapest listings for each model.

### Generate Email
```bash
python deal_finder.py --email <listing_id>
```
Generates a dealer contact email for the specified listing ID.

### Show Filters
```bash
python deal_finder.py --filters
```
Shows current filter configuration.

## Filtering Results

### CLI Filter Options
Apply filters from the command line:
```bash
# Filter by price range
python deal_finder.py --best --price-max 50000
python deal_finder.py --best --price-min 40000 --price-max 60000

# Filter by trim (comma-separated)
python deal_finder.py --best --trim "SR5,Limited,TRD"

# Filter by dealer (comma-separated)
python deal_finder.py --best --dealer "Toyota Escondido,Mossy"

# Filter by year (minimum year)
python deal_finder.py --best --year 2026

# Combine filters
python deal_finder.py --report-only --price-max 55000 --trim "SR,SR5"

# Disable all filters
python deal_finder.py --best --no-filter
```

### Persistent Filters
Edit the `FILTERS` section in `deal_finder.py` to set persistent filters:
```python
FILTERS = {
    "price_min": 40000,           # Minimum price
    "price_max": 70000,           # Maximum price
    "mileage_max": 50000,         # Max mileage (for used)
    "trims_include": ["SR5", "Limited"],  # Only these trims
    "trims_exclude": ["Base"],    # Exclude these trims
    "dealers_include": [],        # Only these dealers
    "dealers_exclude": [],        # Exclude these dealers
    "keywords_exclude": ["Fleet"], # Exclude listings with keywords
    "year_min": 2025,             # Minimum year
    "year_max": None,             # Maximum year
    "only_price_drops": False,    # Only show price drops
    "min_discount_percent": 5,    # Min % off MSRP
}
```

## Output Files

- `truck_deals.db` - SQLite database with all listings
- `truck_deals_report.html` - HTML report (open in browser)

## Database Schema

### listings
Stores all vehicle listings with:
- Source (cars.com, cargurus, autotrader)
- Vehicle details (year, make, model, trim, price, MSRP)
- Dealer info (name, phone, address)
- Tracking (first_seen, last_seen, price_history)

### price_alerts
Tracks price changes for notifications.

### dealer_contacts
Log your dealer communications.

## Tips

1. Run daily to track price changes
2. Use `--best` to quickly see top deals
3. Use `--email` to generate contact templates
4. Check `--drops` for recent price reductions

## Notes

- Respects site rate limits with random delays
- Some sites may block excessive scraping
- Car listing details vary by source
- VIN/stock numbers may not always be available on listing cards
