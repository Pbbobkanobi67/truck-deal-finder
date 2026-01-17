#!/usr/bin/env python3
"""
Truck Deal Finder - Find the best deals on new Toyota Tundras and Ford F-150s
"""

import argparse
import json
import random
import re
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup

# Selenium imports for sites with bot protection
try:
    import undetected_chromedriver as uc
    HAVE_UNDETECTED_CHROME = True
except ImportError:
    HAVE_UNDETECTED_CHROME = False

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

# =============================================================================
# CONFIGURATION
# =============================================================================

CONFIG = {
    "zip_code": "92101",
    "radius": 75,
    "vehicles": [
        {"make": "toyota", "model": "tundra", "year_min": 2024, "year_max": 2026},
        {"make": "ford", "model": "f-150", "year_min": 2024, "year_max": 2026},
    ],
    "condition": "new",  # 'new', 'used', 'all'
    "request_delay": (2, 5),  # random seconds between requests
    "max_pages": 5,
}

# =============================================================================
# SEARCH FILTERS - Customize to narrow down results
# =============================================================================

FILTERS = {
    # Price range (set to None to disable)
    "price_min": None,          # e.g., 40000
    "price_max": None,          # e.g., 70000

    # Mileage range (mainly for used cars)
    "mileage_max": None,        # e.g., 50000

    # Trim filters (case-insensitive, partial match)
    # Only include listings with these trims (empty list = include all)
    "trims_include": [],        # e.g., ["SR5", "Limited", "Platinum", "TRD"]
    # Exclude listings with these trims
    "trims_exclude": [],        # e.g., ["Base", "Work Truck"]

    # Dealer filters (case-insensitive, partial match)
    # Only include listings from these dealers (empty list = include all)
    "dealers_include": [],      # e.g., ["Toyota Escondido", "Mossy"]
    # Exclude listings from these dealers
    "dealers_exclude": [],      # e.g., ["Some Dealer Name"]

    # Keyword filters for title/trim (case-insensitive)
    # Exclude listings containing these keywords
    "keywords_exclude": [],     # e.g., ["Fleet", "Commercial", "Work Truck"]

    # Year filter (in addition to vehicle config)
    "year_min": None,           # e.g., 2025
    "year_max": None,           # e.g., 2026

    # Only show listings with price drops
    "only_price_drops": False,

    # Minimum discount from MSRP (percentage, e.g., 5 means 5% off)
    "min_discount_percent": None,  # e.g., 5
}

EMAIL_CONFIG = {
    "your_name": "",
    "your_phone": "",
}

# User agents for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
]

DB_PATH = Path(__file__).parent / "truck_deals.db"
REPORT_PATH = Path(__file__).parent / "truck_deals_report.html"

# =============================================================================
# FILTER FUNCTIONS
# =============================================================================


def apply_filters(listings: list[dict], filters: dict = None) -> list[dict]:
    """Apply filters to a list of listings. Returns filtered list."""
    if filters is None:
        filters = FILTERS

    filtered = []

    for listing in listings:
        # Price filters
        price = listing.get("price")
        if price:
            if filters.get("price_min") and price < filters["price_min"]:
                continue
            if filters.get("price_max") and price > filters["price_max"]:
                continue

        # Mileage filter
        mileage = listing.get("mileage")
        if filters.get("mileage_max") and mileage and mileage > filters["mileage_max"]:
            continue

        # Year filters
        year = listing.get("year")
        if year:
            if filters.get("year_min") and year < filters["year_min"]:
                continue
            if filters.get("year_max") and year > filters["year_max"]:
                continue

        # Trim include filter (if specified, must match one)
        trim = (listing.get("trim") or "").lower()
        if filters.get("trims_include"):
            if not any(t.lower() in trim for t in filters["trims_include"]):
                continue

        # Trim exclude filter
        if filters.get("trims_exclude"):
            if any(t.lower() in trim for t in filters["trims_exclude"]):
                continue

        # Dealer include filter
        dealer = (listing.get("dealer_name") or "").lower()
        if filters.get("dealers_include"):
            if not any(d.lower() in dealer for d in filters["dealers_include"]):
                continue

        # Dealer exclude filter
        if filters.get("dealers_exclude"):
            if any(d.lower() in dealer for d in filters["dealers_exclude"]):
                continue

        # Keyword exclude filter (checks trim and title)
        if filters.get("keywords_exclude"):
            text_to_check = f"{trim} {listing.get('make', '')} {listing.get('model', '')}".lower()
            if any(kw.lower() in text_to_check for kw in filters["keywords_exclude"]):
                continue

        # Minimum discount from MSRP
        if filters.get("min_discount_percent"):
            msrp = listing.get("msrp")
            if msrp and price:
                discount_pct = ((msrp - price) / msrp) * 100
                if discount_pct < filters["min_discount_percent"]:
                    continue
            elif not msrp:
                # Skip if no MSRP to compare (optional: could include these)
                pass

        # Price drops only filter
        if filters.get("only_price_drops"):
            price_history = listing.get("price_history")
            if isinstance(price_history, str):
                price_history = json.loads(price_history) if price_history else []
            if not price_history:
                continue

        filtered.append(listing)

    return filtered


def get_active_filters_summary() -> str:
    """Get a human-readable summary of active filters."""
    active = []

    if FILTERS.get("price_min"):
        active.append(f"Price >= ${FILTERS['price_min']:,}")
    if FILTERS.get("price_max"):
        active.append(f"Price <= ${FILTERS['price_max']:,}")
    if FILTERS.get("mileage_max"):
        active.append(f"Mileage <= {FILTERS['mileage_max']:,}")
    if FILTERS.get("year_min"):
        active.append(f"Year >= {FILTERS['year_min']}")
    if FILTERS.get("year_max"):
        active.append(f"Year <= {FILTERS['year_max']}")
    if FILTERS.get("trims_include"):
        active.append(f"Trims: {', '.join(FILTERS['trims_include'])}")
    if FILTERS.get("trims_exclude"):
        active.append(f"Excluding trims: {', '.join(FILTERS['trims_exclude'])}")
    if FILTERS.get("dealers_include"):
        active.append(f"Dealers: {', '.join(FILTERS['dealers_include'])}")
    if FILTERS.get("dealers_exclude"):
        active.append(f"Excluding dealers: {', '.join(FILTERS['dealers_exclude'])}")
    if FILTERS.get("keywords_exclude"):
        active.append(f"Excluding: {', '.join(FILTERS['keywords_exclude'])}")
    if FILTERS.get("min_discount_percent"):
        active.append(f"Min {FILTERS['min_discount_percent']}% off MSRP")
    if FILTERS.get("only_price_drops"):
        active.append("Only price drops")

    return " | ".join(active) if active else "None"


# =============================================================================
# DATABASE OPERATIONS
# =============================================================================


def get_db_connection() -> sqlite3.Connection:
    """Get database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the SQLite database with required tables."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Listings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS listings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            listing_id TEXT NOT NULL,
            make TEXT NOT NULL,
            model TEXT NOT NULL,
            year INTEGER NOT NULL,
            trim TEXT,
            price INTEGER,
            msrp INTEGER,
            mileage INTEGER,
            dealer_name TEXT,
            dealer_phone TEXT,
            dealer_address TEXT,
            listing_url TEXT,
            vin TEXT,
            stock_number TEXT,
            first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            price_history TEXT DEFAULT '[]',
            UNIQUE(source, listing_id)
        )
    """)

    # Price alerts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            listing_id INTEGER NOT NULL,
            old_price INTEGER,
            new_price INTEGER,
            change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notified INTEGER DEFAULT 0,
            FOREIGN KEY (listing_id) REFERENCES listings(id)
        )
    """)

    # Dealer contacts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dealer_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dealer_name TEXT NOT NULL,
            contact_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            listing_ids TEXT,
            quoted_price INTEGER,
            notes TEXT
        )
    """)

    # Create indexes for better performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_listings_make_model ON listings(make, model)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_price_alerts_date ON price_alerts(change_date)")

    conn.commit()
    conn.close()
    print("Database initialized successfully.")


def upsert_listing(listing: dict) -> tuple[str, bool]:
    """
    Insert or update a listing. Returns (action, price_changed).
    action: 'inserted', 'updated', 'unchanged'
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if listing exists
    cursor.execute(
        "SELECT id, price, price_history FROM listings WHERE source = ? AND listing_id = ?",
        (listing["source"], listing["listing_id"]),
    )
    existing = cursor.fetchone()

    now = datetime.now().isoformat()
    price_changed = False

    if existing:
        old_price = existing["price"]
        new_price = listing.get("price")

        # Check if price changed
        if old_price and new_price and old_price != new_price:
            price_changed = True
            # Update price history
            price_history = json.loads(existing["price_history"] or "[]")
            price_history.append({
                "price": old_price,
                "date": now,
            })

            # Create price alert
            cursor.execute(
                """INSERT INTO price_alerts (listing_id, old_price, new_price)
                   VALUES (?, ?, ?)""",
                (existing["id"], old_price, new_price),
            )

            # Update listing
            cursor.execute(
                """UPDATE listings SET
                   price = ?, last_seen = ?, price_history = ?,
                   trim = COALESCE(?, trim),
                   msrp = COALESCE(?, msrp),
                   mileage = COALESCE(?, mileage),
                   dealer_name = COALESCE(?, dealer_name),
                   dealer_phone = COALESCE(?, dealer_phone),
                   dealer_address = COALESCE(?, dealer_address),
                   vin = COALESCE(?, vin),
                   stock_number = COALESCE(?, stock_number)
                   WHERE id = ?""",
                (
                    new_price,
                    now,
                    json.dumps(price_history),
                    listing.get("trim"),
                    listing.get("msrp"),
                    listing.get("mileage"),
                    listing.get("dealer_name"),
                    listing.get("dealer_phone"),
                    listing.get("dealer_address"),
                    listing.get("vin"),
                    listing.get("stock_number"),
                    existing["id"],
                ),
            )
            action = "updated"
        else:
            # Just update last_seen and any new info
            cursor.execute(
                """UPDATE listings SET
                   last_seen = ?,
                   trim = COALESCE(?, trim),
                   msrp = COALESCE(?, msrp),
                   mileage = COALESCE(?, mileage),
                   dealer_name = COALESCE(?, dealer_name),
                   dealer_phone = COALESCE(?, dealer_phone),
                   dealer_address = COALESCE(?, dealer_address),
                   vin = COALESCE(?, vin),
                   stock_number = COALESCE(?, stock_number)
                   WHERE id = ?""",
                (
                    now,
                    listing.get("trim"),
                    listing.get("msrp"),
                    listing.get("mileage"),
                    listing.get("dealer_name"),
                    listing.get("dealer_phone"),
                    listing.get("dealer_address"),
                    listing.get("vin"),
                    listing.get("stock_number"),
                    existing["id"],
                ),
            )
            action = "unchanged"
    else:
        # Insert new listing
        cursor.execute(
            """INSERT INTO listings
               (source, listing_id, make, model, year, trim, price, msrp, mileage,
                dealer_name, dealer_phone, dealer_address, listing_url, vin, stock_number,
                first_seen, last_seen, price_history)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                listing["source"],
                listing["listing_id"],
                listing["make"],
                listing["model"],
                listing["year"],
                listing.get("trim"),
                listing.get("price"),
                listing.get("msrp"),
                listing.get("mileage"),
                listing.get("dealer_name"),
                listing.get("dealer_phone"),
                listing.get("dealer_address"),
                listing.get("listing_url"),
                listing.get("vin"),
                listing.get("stock_number"),
                now,
                now,
                "[]",
            ),
        )
        action = "inserted"

    conn.commit()
    conn.close()
    return action, price_changed


def get_listings(
    make: Optional[str] = None,
    model: Optional[str] = None,
    use_filters: bool = True
) -> list[dict]:
    """Get listings from database, optionally filtered by make/model and FILTERS config."""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM listings WHERE 1=1"
    params = []

    if make:
        query += " AND LOWER(make) = LOWER(?)"
        params.append(make)
    if model:
        query += " AND LOWER(model) = LOWER(?)"
        params.append(model)

    query += " ORDER BY price ASC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    listings = [dict(row) for row in rows]

    # Apply configured filters if enabled
    if use_filters:
        listings = apply_filters(listings)

    return listings


def get_listing_by_id(listing_id: int) -> Optional[dict]:
    """Get a single listing by database ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM listings WHERE id = ?", (listing_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_price_drops(days: int = 7) -> list[dict]:
    """Get price drops from the last N days."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    cursor.execute(
        """SELECT pa.*, l.make, l.model, l.year, l.trim, l.dealer_name, l.listing_url
           FROM price_alerts pa
           JOIN listings l ON pa.listing_id = l.id
           WHERE pa.change_date >= ?
           ORDER BY pa.change_date DESC""",
        (cutoff,),
    )
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# =============================================================================
# HTTP UTILITIES
# =============================================================================


def get_session() -> requests.Session:
    """Create a requests session with random user agent."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    })
    return session


def random_delay():
    """Sleep for a random duration between requests."""
    delay = random.uniform(*CONFIG["request_delay"])
    time.sleep(delay)


# =============================================================================
# CARS.COM SCRAPER
# =============================================================================


def build_cars_com_url(make: str, model: str, year_min: int, year_max: int, page: int = 1) -> str:
    """Build Cars.com search URL."""
    # Cars.com URL structure
    condition_map = {"new": "new", "used": "used", "all": "all"}
    stock_type = condition_map.get(CONFIG["condition"], "new")

    params = {
        "stock_type": stock_type,
        "makes[]": make,
        "models[]": f"{make}-{model}",
        "list_price_max": "",
        "maximum_distance": CONFIG["radius"],
        "zip": CONFIG["zip_code"],
        "year_min": year_min,
        "year_max": year_max,
        "page": page,
        "page_size": 20,
        "sort": "best_match_desc",
    }

    base_url = "https://www.cars.com/shopping/results/"
    return f"{base_url}?{urlencode(params, doseq=True)}"


def parse_cars_com_listing(card: BeautifulSoup, make: str, model: str) -> Optional[dict]:
    """Parse a single listing card from Cars.com."""
    try:
        # Get listing ID from data attribute or link
        listing_id = card.get("data-listing-id") or card.get("id", "").replace("listing-", "")
        if not listing_id:
            link = card.select_one("a.image-gallery-link, a.vehicle-card-link")
            if link and link.get("href"):
                match = re.search(r"/vehicle/(\d+)/", link["href"])
                if match:
                    listing_id = match.group(1)

        if not listing_id:
            return None

        # Title parsing (year, make, model, trim)
        title_elem = card.select_one("h2.title, h2.vehicle-card-title, .title")
        title_text = title_elem.get_text(strip=True) if title_elem else ""

        # Verify the model matches what we're looking for
        # Handle hyphenated models like "f-150" matching "F-150" or "F 150"
        model_pattern = model.replace("-", "[-\\s]?")
        if not re.search(rf"(?i)\b{model_pattern}\b", title_text):
            return None  # Skip listings that don't match the model

        # Extract year
        year_match = re.search(r"(\d{4})", title_text)
        year = int(year_match.group(1)) if year_match else None

        # Extract trim (everything after make model)
        trim = None
        if title_text:
            # Remove year and make/model to get trim
            trim_text = re.sub(r"^\d{4}\s+", "", title_text)
            trim_text = re.sub(rf"(?i){make}\s+{model}\s*", "", trim_text)
            trim = trim_text.strip() if trim_text.strip() else None

        # Price
        price = None
        price_elem = card.select_one(".primary-price, .price-section .primary-price")
        if price_elem:
            price_text = price_elem.get_text(strip=True)
            price_match = re.search(r"[\$]?([\d,]+)", price_text)
            if price_match:
                price = int(price_match.group(1).replace(",", ""))

        # MSRP
        msrp = None
        msrp_elem = card.select_one(".price-section .secondary-price, .msrp")
        if msrp_elem:
            msrp_text = msrp_elem.get_text(strip=True)
            msrp_match = re.search(r"[\$]?([\d,]+)", msrp_text)
            if msrp_match:
                msrp = int(msrp_match.group(1).replace(",", ""))

        # Mileage
        mileage = None
        mileage_elem = card.select_one(".mileage, .vehicle-card-mileage")
        if mileage_elem:
            mileage_text = mileage_elem.get_text(strip=True)
            mileage_match = re.search(r"([\d,]+)", mileage_text)
            if mileage_match:
                mileage = int(mileage_match.group(1).replace(",", ""))

        # Dealer info
        dealer_name = None
        dealer_elem = card.select_one(".dealer-name a, .dealer-name")
        if dealer_elem:
            dealer_name = dealer_elem.get_text(strip=True)

        dealer_address = None
        address_elem = card.select_one(".dealer-address, .miles-from")
        if address_elem:
            dealer_address = address_elem.get_text(strip=True)

        # Listing URL
        listing_url = None
        link_elem = card.select_one("a.vehicle-card-link, a.image-gallery-link")
        if link_elem and link_elem.get("href"):
            href = link_elem["href"]
            if href.startswith("/"):
                listing_url = f"https://www.cars.com{href}"
            else:
                listing_url = href

        # Stock number and VIN (sometimes in details)
        stock_number = None
        vin = None
        details_elem = card.select_one(".vehicle-details, .stock-type")
        if details_elem:
            details_text = details_elem.get_text()
            stock_match = re.search(r"Stock[:\s#]*(\w+)", details_text, re.I)
            if stock_match:
                stock_number = stock_match.group(1)
            vin_match = re.search(r"VIN[:\s]*([A-HJ-NPR-Z0-9]{17})", details_text, re.I)
            if vin_match:
                vin = vin_match.group(1)

        return {
            "source": "cars.com",
            "listing_id": listing_id,
            "make": make.title(),
            "model": model.upper() if model.lower() == "f-150" else model.title(),
            "year": year,
            "trim": trim,
            "price": price,
            "msrp": msrp,
            "mileage": mileage,
            "dealer_name": dealer_name,
            "dealer_phone": None,  # Not usually on listing cards
            "dealer_address": dealer_address,
            "listing_url": listing_url,
            "vin": vin,
            "stock_number": stock_number,
        }
    except Exception as e:
        print(f"  Error parsing listing: {e}")
        return None


def scrape_cars_com(vehicle: dict) -> list[dict]:
    """Scrape Cars.com for a specific vehicle configuration."""
    make = vehicle["make"]
    model = vehicle["model"]
    year_min = vehicle["year_min"]
    year_max = vehicle["year_max"]

    print(f"\nScraping Cars.com for {year_min}-{year_max} {make.title()} {model.title()}...")

    session = get_session()
    all_listings = []

    for page in range(1, CONFIG["max_pages"] + 1):
        url = build_cars_com_url(make, model, year_min, year_max, page)
        print(f"  Page {page}: {url[:80]}...")

        # Retry logic with exponential backoff
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Create new session for each attempt (new user agent)
                if attempt > 0:
                    session = get_session()
                    retry_delay = (attempt + 1) * 5
                    print(f"    Retry {attempt + 1}/{max_retries} after {retry_delay}s...")
                    time.sleep(retry_delay)

                response = session.get(url, timeout=60)
                response.raise_for_status()

                soup = BeautifulSoup(response.text, "lxml")

                # Find listing cards
                cards = soup.select("div.vehicle-card, div[data-listing-id], .vehicle-card-content")

                if not cards:
                    # Try alternative selectors
                    cards = soup.select("[class*='vehicle-card']")

                if not cards:
                    print(f"  No listings found on page {page}")
                    break

                page_listings = []
                for card in cards:
                    listing = parse_cars_com_listing(card, make, model)
                    if listing and listing.get("price"):
                        page_listings.append(listing)

                all_listings.extend(page_listings)
                print(f"  Found {len(page_listings)} listings on page {page}")

                # Check if there's a next page
                next_btn = soup.select_one("a[aria-label='Next page'], .next-page")
                if not next_btn or len(page_listings) == 0:
                    break

                random_delay()
                break  # Success, exit retry loop

            except requests.exceptions.Timeout as e:
                if attempt < max_retries - 1:
                    print(f"    Timeout on attempt {attempt + 1}, retrying...")
                    continue
                print(f"  Error fetching page {page}: {e}")
                break
            except requests.exceptions.RequestException as e:
                print(f"  Error fetching page {page}: {e}")
                break
            except Exception as e:
                print(f"  Error processing page {page}: {e}")
                break
        else:
            # All retries failed
            break

    print(f"  Total: {len(all_listings)} listings from Cars.com")
    return all_listings


# =============================================================================
# CARGURUS SCRAPER (Selenium-based)
# =============================================================================


def get_chrome_driver(use_undetected: bool = True):
    """Create a headless Chrome WebDriver, using undetected-chromedriver if available."""
    if use_undetected and HAVE_UNDETECTED_CHROME:
        options = uc.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        return uc.Chrome(options=options, use_subprocess=True)
    else:
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(f"--user-agent={random.choice(USER_AGENTS)}")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        return driver


def build_cargurus_url(make: str, model: str, year_min: int, year_max: int) -> str:
    """Build CarGurus search URL for browser navigation."""
    condition_map = {"new": "NEW", "used": "USED", "all": ""}
    stock_type = condition_map.get(CONFIG["condition"], "NEW")

    # CarGurus friendly URL format
    make_lower = make.lower()
    model_lower = model.lower().replace("-", "-")  # Keep hyphens

    params = {
        "zip": CONFIG["zip_code"],
        "distance": CONFIG["radius"],
        "minYear": year_min,
        "maxYear": year_max,
        "showNegotiable": "true",
        "sortDir": "ASC",
        "sortType": "DEAL_SCORE",
    }

    if stock_type:
        params["inventorySearchWidgetType"] = stock_type

    base_url = f"https://www.cargurus.com/Cars/new/{make_lower.capitalize()}-{model_lower.replace('-', '_').title()}-{make_lower[0].upper()}{make_lower[1:]}"

    # Use simpler URL format
    return f"https://www.cargurus.com/Cars/l-Used-{make.capitalize()}-{model.replace('-', '_').title()}-d{get_cargurus_model_code(make, model)}?{urlencode(params)}"


def get_cargurus_model_code(make: str, model: str) -> str:
    """Get CarGurus model code for URL."""
    model_codes = {
        "toyota-tundra": "295",
        "ford-f-150": "333",
    }
    return model_codes.get(f"{make.lower()}-{model.lower()}", "")


def parse_cargurus_listing_selenium(card, make: str, model: str) -> Optional[dict]:
    """Parse a single listing card from CarGurus (from Selenium element or BeautifulSoup)."""
    try:
        # Handle both BeautifulSoup Tag and Selenium WebElement
        if hasattr(card, 'get_attribute'):
            # Selenium WebElement
            html = card.get_attribute('outerHTML')
            card = BeautifulSoup(html, 'lxml')

        # Get listing ID from various attributes
        listing_id = (
            card.get("data-listing-id") or
            card.get("id", "").replace("listing-", "") or
            card.get("data-cg-listing-id", "")
        )

        # Try to extract from link if not found
        if not listing_id:
            link = card.select_one("a[href*='listing'], a[href*='vehicle']")
            if link and link.get("href"):
                match = re.search(r"listing[=/](\d+)|vehicle[=/](\d+)", link["href"])
                if match:
                    listing_id = match.group(1) or match.group(2)

        if not listing_id:
            # Generate from URL or other unique identifier
            link = card.select_one("a[href]")
            if link:
                listing_id = str(hash(link.get("href", "")))[:10]

        if not listing_id:
            return None

        # Title - try multiple selectors
        title_text = ""
        for selector in ["h4", "h2", "h3", "[data-testid='srp-tile-title']", ".listing-title",
                        "[class*='title']", "a[class*='title']"]:
            title_elem = card.select_one(selector)
            if title_elem:
                title_text = title_elem.get_text(strip=True)
                if title_text and re.search(r"\d{4}", title_text):
                    break

        # Verify model matches
        model_pattern = model.replace("-", "[-\\s]?")
        if title_text and not re.search(rf"(?i)\b{model_pattern}\b", title_text):
            return None

        # Extract year
        year = None
        year_match = re.search(r"(\d{4})", title_text)
        if year_match:
            year = int(year_match.group(1))

        # Extract trim (everything after make model in title)
        trim = None
        if title_text:
            trim_text = re.sub(r"^\d{4}\s+", "", title_text)
            trim_text = re.sub(rf"(?i){make}\s+{model.replace('-', '[-\\s]?')}\s*", "", trim_text)
            trim = trim_text.strip() if trim_text.strip() else None

        # Price - try multiple selectors
        price = None
        for selector in ["[data-testid='srp-tile-price']", "[class*='price']", ".price",
                        "[data-cg-ft='listing-price']", "span[class*='Price']"]:
            price_elem = card.select_one(selector)
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                price_match = re.search(r"[\$]?([\d,]+)", price_text)
                if price_match:
                    price = int(price_match.group(1).replace(",", ""))
                    if price > 10000:  # Sanity check for car price
                        break

        # Mileage
        mileage = None
        for selector in ["[data-testid='srp-tile-mileage']", "[class*='mileage']", ".mileage"]:
            mileage_elem = card.select_one(selector)
            if mileage_elem:
                mileage_text = mileage_elem.get_text(strip=True)
                mileage_match = re.search(r"([\d,]+)", mileage_text)
                if mileage_match:
                    mileage = int(mileage_match.group(1).replace(",", ""))
                    break

        # Dealer name
        dealer_name = None
        for selector in ["[data-testid='srp-tile-dealer-name']", "[class*='dealer']",
                        ".dealer-name", "[data-cg-ft='listing-dealer-name']"]:
            dealer_elem = card.select_one(selector)
            if dealer_elem:
                dealer_name = dealer_elem.get_text(strip=True)
                if dealer_name:
                    break

        # Listing URL
        listing_url = None
        link_elem = card.select_one("a[href*='listing'], a[href*='vehicle'], a[href*='/Cars/']")
        if link_elem and link_elem.get("href"):
            href = link_elem["href"]
            if href.startswith("/"):
                listing_url = f"https://www.cargurus.com{href}"
            elif href.startswith("http"):
                listing_url = href

        return {
            "source": "cargurus",
            "listing_id": listing_id,
            "make": make.title(),
            "model": model.upper() if model.lower() == "f-150" else model.title(),
            "year": year,
            "trim": trim,
            "price": price,
            "msrp": None,
            "mileage": mileage,
            "dealer_name": dealer_name,
            "dealer_phone": None,
            "dealer_address": None,
            "listing_url": listing_url,
            "vin": None,
            "stock_number": None,
        }
    except Exception as e:
        print(f"  Error parsing CarGurus listing: {e}")
        return None


def scrape_cargurus(vehicle: dict) -> list[dict]:
    """Scrape CarGurus using Selenium for a specific vehicle configuration."""
    make = vehicle["make"]
    model = vehicle["model"]
    year_min = vehicle["year_min"]
    year_max = vehicle["year_max"]

    print(f"\nScraping CarGurus for {year_min}-{year_max} {make.title()} {model.title()}...")

    model_code = get_cargurus_model_code(make, model)
    if not model_code:
        print(f"  Unknown model code for {make} {model}")
        return []

    # Build URL - try the search results format
    params = {
        "zip": CONFIG["zip_code"],
        "distance": CONFIG["radius"],
        "minYear": year_min,
        "maxYear": year_max,
        "showNegotiable": "true",
        "sortDir": "ASC",
        "sortType": "DEAL_SCORE",
    }
    if CONFIG["condition"] == "new":
        params["inventorySearchWidgetType"] = "NEW"

    url = f"https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?sourceContext=carGurusHomePageModel&entitySelectingHelper.selectedEntity=d{model_code}&{urlencode(params)}"

    all_listings = []
    driver = None

    try:
        print("  Starting browser (using undetected-chromedriver)..." if HAVE_UNDETECTED_CHROME else "  Starting browser...")
        driver = get_chrome_driver(use_undetected=True)

        print("  Loading page...")
        driver.get(url)
        time.sleep(8)  # Wait for JS to execute

        page_source = driver.page_source
        page_len = len(page_source)

        # Check for bot protection
        if page_len < 5000:
            page_title = driver.title.lower()
            if "cargurus.com" == page_title or page_len < 2000:
                print("  Blocked by bot protection (site requires human verification)")
                print("  Note: CarGurus has enterprise-level bot detection that blocks automated access")
                return []

        soup = BeautifulSoup(page_source, "lxml")
        page_text = soup.get_text()

        # Check if we got the model we wanted
        model_check = model.replace("-", " ").lower()
        if model_check not in page_text.lower() and make.lower() not in page_text.lower():
            print("  Page loaded but doesn't contain expected vehicle listings")
            print("  CarGurus may be redirecting or blocking the search")
            return []

        # Find listing cards
        cards = soup.select(
            "[data-testid='srp-tile'], "
            "[data-listing-id], "
            "article[class*='result'], "
            "[class*='ResultCard'], "
            "[class*='listing-row']"
        )

        if not cards:
            cards = soup.select("article, [role='listitem']")

        print(f"  Found {len(cards)} potential listing cards")

        for card in cards:
            listing = parse_cargurus_listing_selenium(card, make, model)
            if listing and listing.get("price"):
                all_listings.append(listing)

        print(f"  Parsed {len(all_listings)} valid listings")

    except WebDriverException as e:
        print(f"  Browser error: {e}")
    except Exception as e:
        print(f"  Error scraping CarGurus: {e}")
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass  # Ignore cleanup errors

    print(f"  Total: {len(all_listings)} listings from CarGurus")
    return all_listings


# =============================================================================
# AUTOTRADER SCRAPER
# =============================================================================


def build_autotrader_url(make: str, model: str, year_min: int, year_max: int, page: int = 1) -> str:
    """Build Autotrader search URL."""
    # Autotrader uses path-based URLs with specific format
    condition_map = {"new": "new-cars", "used": "used-cars", "all": "all-cars"}
    condition = condition_map.get(CONFIG["condition"], "new-cars")

    # Calculate first record for pagination (25 per page)
    first_record = (page - 1) * 25

    params = {
        "zip": CONFIG["zip_code"],
        "searchRadius": CONFIG["radius"],
        "startYear": year_min,
        "endYear": year_max,
        "isNewSearch": "false",
        "marketExtension": "include",
        "sortBy": "relevance",
        "numRecords": 25,
        "firstRecord": first_record,
    }

    # Model name formatting - keep hyphens for Autotrader
    model_url = model.lower()

    base_url = f"https://www.autotrader.com/cars-for-sale/{condition}/{make.lower()}/{model_url}"
    return f"{base_url}?{urlencode(params)}"


def parse_autotrader_listing(card: BeautifulSoup, make: str, model: str) -> Optional[dict]:
    """Parse a single listing from Autotrader."""
    try:
        # Get listing ID from data attribute or link
        listing_id = card.get("data-cmp") or card.get("id", "")
        if not listing_id:
            link = card.select_one("a[href*='/cars-for-sale/']")
            if link and link.get("href"):
                match = re.search(r"/cars-for-sale/vehicledetails\.xhtml\?listingId=(\d+)", link["href"])
                if not match:
                    match = re.search(r"/listing/(\d+)", link["href"])
                if match:
                    listing_id = match.group(1)

        if not listing_id:
            return None

        # Title parsing
        title_elem = card.select_one("h2, h3, [data-cmp='heading'], .inventory-listing-title")
        title_text = title_elem.get_text(strip=True) if title_elem else ""

        # Verify the model matches
        model_pattern = model.replace("-", "[-\\s]?")
        if not re.search(rf"(?i)\b{model_pattern}\b", title_text):
            return None

        # Extract year
        year_match = re.search(r"(\d{4})", title_text)
        year = int(year_match.group(1)) if year_match else None

        # Extract trim
        trim = None
        if title_text:
            trim_text = re.sub(r"^\d{4}\s+", "", title_text)
            trim_text = re.sub(rf"(?i){make}\s+{model.replace('-', '[-\\s]?')}\s*", "", trim_text)
            trim = trim_text.strip() if trim_text.strip() else None

        # Price
        price = None
        price_elem = card.select_one("[data-cmp='firstPrice'], .first-price, .primary-price, .price-value")
        if price_elem:
            price_text = price_elem.get_text(strip=True)
            price_match = re.search(r"[\$]?([\d,]+)", price_text)
            if price_match:
                price = int(price_match.group(1).replace(",", ""))

        # MSRP
        msrp = None
        msrp_elem = card.select_one(".msrp, .original-price")
        if msrp_elem:
            msrp_text = msrp_elem.get_text(strip=True)
            msrp_match = re.search(r"[\$]?([\d,]+)", msrp_text)
            if msrp_match:
                msrp = int(msrp_match.group(1).replace(",", ""))

        # Mileage
        mileage = None
        mileage_elem = card.select_one("[data-cmp='mileage'], .mileage, .miles")
        if mileage_elem:
            mileage_text = mileage_elem.get_text(strip=True)
            mileage_match = re.search(r"([\d,]+)", mileage_text)
            if mileage_match:
                mileage = int(mileage_match.group(1).replace(",", ""))

        # Dealer info
        dealer_name = None
        dealer_elem = card.select_one("[data-cmp='dealerName'], .dealer-name, .seller-name")
        if dealer_elem:
            dealer_name = dealer_elem.get_text(strip=True)

        dealer_address = None
        address_elem = card.select_one(".dealer-address, .dealer-location, .seller-location")
        if address_elem:
            dealer_address = address_elem.get_text(strip=True)

        # Listing URL
        listing_url = None
        link_elem = card.select_one("a[href*='/cars-for-sale/'], a[href*='vehicledetails']")
        if link_elem and link_elem.get("href"):
            href = link_elem["href"]
            if href.startswith("/"):
                listing_url = f"https://www.autotrader.com{href}"
            else:
                listing_url = href

        # VIN - sometimes visible
        vin = None
        vin_elem = card.select_one(".vin, [data-cmp='vin']")
        if vin_elem:
            vin_text = vin_elem.get_text(strip=True)
            vin_match = re.search(r"([A-HJ-NPR-Z0-9]{17})", vin_text, re.I)
            if vin_match:
                vin = vin_match.group(1)

        return {
            "source": "autotrader",
            "listing_id": listing_id,
            "make": make.title(),
            "model": model.upper() if model.lower() == "f-150" else model.title(),
            "year": year,
            "trim": trim,
            "price": price,
            "msrp": msrp,
            "mileage": mileage,
            "dealer_name": dealer_name,
            "dealer_phone": None,
            "dealer_address": dealer_address,
            "listing_url": listing_url,
            "vin": vin,
            "stock_number": None,
        }
    except Exception as e:
        print(f"  Error parsing Autotrader listing: {e}")
        return None


def scrape_autotrader(vehicle: dict) -> list[dict]:
    """Scrape Autotrader for a specific vehicle configuration."""
    make = vehicle["make"]
    model = vehicle["model"]
    year_min = vehicle["year_min"]
    year_max = vehicle["year_max"]

    print(f"\nScraping Autotrader for {year_min}-{year_max} {make.title()} {model.title()}...")

    session = get_session()
    all_listings = []

    for page in range(1, CONFIG["max_pages"] + 1):
        url = build_autotrader_url(make, model, year_min, year_max, page)
        print(f"  Page {page}...")

        # Retry logic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    session = get_session()
                    retry_delay = (attempt + 1) * 5
                    print(f"    Retry {attempt + 1}/{max_retries} after {retry_delay}s...")
                    time.sleep(retry_delay)

                response = session.get(url, timeout=60)
                response.raise_for_status()

                # Check for bot protection block page
                if "unavailable" in response.text.lower() and "incident" in response.text.lower():
                    print(f"  Blocked by bot protection (requires browser-based scraping)")
                    return all_listings

                soup = BeautifulSoup(response.text, "lxml")

                # Find listing cards - Autotrader uses various class patterns
                cards = soup.select(
                    "[data-cmp='inventoryListing'], "
                    ".inventory-listing, "
                    "[class*='listing-'], "
                    "[data-qaid='cntnr-listings-tier']"
                )

                if not cards:
                    # Try to find any article or div that looks like a listing
                    cards = soup.select("article, [class*='result-item']")

                if not cards:
                    print(f"  No listings found on page {page}")
                    break

                page_listings = []
                for card in cards:
                    listing = parse_autotrader_listing(card, make, model)
                    if listing and listing.get("price"):
                        page_listings.append(listing)

                all_listings.extend(page_listings)
                print(f"  Found {len(page_listings)} listings on page {page}")

                if len(page_listings) == 0:
                    break

                random_delay()
                break  # Success

            except requests.exceptions.Timeout as e:
                if attempt < max_retries - 1:
                    print(f"    Timeout on attempt {attempt + 1}, retrying...")
                    continue
                print(f"  Error fetching page {page}: {e}")
                break
            except requests.exceptions.RequestException as e:
                print(f"  Error fetching page {page}: {e}")
                if "403" in str(e) or "Forbidden" in str(e):
                    print(f"  Warning: Autotrader may be blocking requests. Continuing with other sources...")
                break
            except Exception as e:
                print(f"  Error processing page {page}: {e}")
                break
        else:
            break

    print(f"  Total: {len(all_listings)} listings from Autotrader")
    return all_listings


# =============================================================================
# EMAIL GENERATOR
# =============================================================================


def generate_email_direct_otd(listing: dict) -> dict:
    """Generate direct OTD price request email."""
    subject = f"OTD Price Request - {listing['year']} {listing['make']} {listing['model']}"
    if listing.get("trim"):
        subject += f" {listing['trim']}"

    body = f"""Hello,

I am interested in the {listing['year']} {listing['make']} {listing['model']}"""

    if listing.get("trim"):
        body += f" {listing['trim']}"

    body += " currently listed on your website.\n\n"

    if listing.get("stock_number"):
        body += f"Stock #: {listing['stock_number']}\n"
    if listing.get("vin"):
        body += f"VIN: {listing['vin']}\n"
    if listing.get("price"):
        body += f"Listed Price: ${listing['price']:,}\n"

    body += """
Could you please provide your best out-the-door price including all taxes, fees, and any available incentives/rebates? I have financing arranged externally.

I am a serious buyer looking to make a purchase decision within the next week.

Thank you,
"""
    if EMAIL_CONFIG.get("your_name"):
        body += f"{EMAIL_CONFIG['your_name']}\n"
    if EMAIL_CONFIG.get("your_phone"):
        body += f"{EMAIL_CONFIG['your_phone']}\n"

    return {"subject": subject, "body": body}


def generate_email_competitive(listing: dict, competitor_price: int) -> dict:
    """Generate competitive leverage email."""
    subject = f"Price Match Request - {listing['year']} {listing['make']} {listing['model']}"

    body = f"""Hello,

I am looking to purchase a {listing['year']} {listing['make']} {listing['model']}"""

    if listing.get("trim"):
        body += f" {listing['trim']}"

    body += f""".

I have received an out-the-door quote of ${competitor_price:,} from another dealer in the area for a comparably equipped vehicle.

"""
    if listing.get("stock_number"):
        body += f"Regarding your Stock #{listing['stock_number']}, "
    else:
        body += "For the vehicle you have listed, "

    body += """can you match or beat this price? Please provide your best OTD price including all taxes and fees.

I am ready to make a decision this week and would prefer to work with your dealership if the numbers work out.

Thank you,
"""
    if EMAIL_CONFIG.get("your_name"):
        body += f"{EMAIL_CONFIG['your_name']}\n"
    if EMAIL_CONFIG.get("your_phone"):
        body += f"{EMAIL_CONFIG['your_phone']}\n"

    return {"subject": subject, "body": body}


def generate_email_multi_vehicle(dealer_name: str, listings: list[dict]) -> dict:
    """Generate multi-vehicle inquiry email."""
    if not listings:
        return {"subject": "", "body": ""}

    make = listings[0]["make"]
    model = listings[0]["model"]

    subject = f"Quote Request - {make} {model} Inventory"

    body = f"""Hello {dealer_name or 'Sales Team'},

I am in the market for a {make} {model} and noticed you have several in stock that interest me. Could you please provide out-the-door pricing for each of the following vehicles?

"""
    for i, listing in enumerate(listings, 1):
        body += f"{i}. {listing['year']} {listing['make']} {listing['model']}"
        if listing.get("trim"):
            body += f" {listing['trim']}"
        if listing.get("stock_number"):
            body += f" (Stock #{listing['stock_number']})"
        if listing.get("price"):
            body += f" - Listed at ${listing['price']:,}"
        body += "\n"

    body += """
Please include all taxes, fees, and any available incentives/rebates in your OTD quotes. I have outside financing arranged.

Thank you,
"""
    if EMAIL_CONFIG.get("your_name"):
        body += f"{EMAIL_CONFIG['your_name']}\n"
    if EMAIL_CONFIG.get("your_phone"):
        body += f"{EMAIL_CONFIG['your_phone']}\n"

    return {"subject": subject, "body": body}


# =============================================================================
# HTML REPORT GENERATOR
# =============================================================================


def generate_html_report():
    """Generate the HTML deals report."""
    tundras = get_listings(make="toyota", model="tundra")
    f150s = get_listings(make="ford", model="f-150")
    price_drops = get_price_drops(days=7)
    active_filters = get_active_filters_summary()

    # Stats
    total_listings = len(tundras) + len(f150s)
    best_tundra = tundras[0]["price"] if tundras else None
    best_f150 = f150s[0]["price"] if f150s else None

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Truck Deal Finder Report</title>
    <style>
        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
            padding: 20px;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}
        h1 {{
            color: #1a1a1a;
            margin-bottom: 10px;
            font-size: 2rem;
        }}
        .subtitle {{
            color: #666;
            margin-bottom: 30px;
        }}
        .stats-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }}
        .stat-card {{
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        .stat-card h3 {{
            color: #666;
            font-size: 0.9rem;
            text-transform: uppercase;
            margin-bottom: 5px;
        }}
        .stat-card .value {{
            font-size: 1.8rem;
            font-weight: bold;
            color: #2563eb;
        }}
        .stat-card .value.green {{
            color: #16a34a;
        }}
        section {{
            background: white;
            border-radius: 10px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        section h2 {{
            color: #1a1a1a;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e5e5;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
        }}
        th, td {{
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e5e5;
        }}
        th {{
            background: #f8f9fa;
            font-weight: 600;
            color: #555;
            font-size: 0.85rem;
            text-transform: uppercase;
        }}
        tr:hover {{
            background: #f8f9fa;
        }}
        .price {{
            font-weight: bold;
            color: #16a34a;
        }}
        .price-drop {{
            color: #dc2626;
        }}
        .price-drop .savings {{
            color: #16a34a;
            font-weight: bold;
        }}
        a {{
            color: #2563eb;
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
        .email-templates {{
            background: #f8f9fa;
        }}
        .email-templates pre {{
            background: white;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            font-size: 0.9rem;
            border: 1px solid #e5e5e5;
            margin-top: 10px;
        }}
        .template-section {{
            margin-bottom: 25px;
        }}
        .filters-banner {{
            background: #e0f2fe;
            border: 1px solid #7dd3fc;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            color: #0369a1;
        }}
        .filters-banner strong {{
            color: #0c4a6e;
        }}
        .template-section h3 {{
            color: #333;
            margin-bottom: 10px;
        }}
        .no-data {{
            color: #666;
            font-style: italic;
            padding: 20px;
            text-align: center;
        }}
        .updated {{
            color: #666;
            font-size: 0.85rem;
            text-align: right;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Truck Deal Finder Report</h1>
        <p class="subtitle">Best deals on new Toyota Tundras and Ford F-150s near San Diego (ZIP: {CONFIG['zip_code']})</p>

        {f'<div class="filters-banner"><strong>Active Filters:</strong> {active_filters}</div>' if active_filters != "None" else ''}

        <div class="stats-grid">
            <div class="stat-card">
                <h3>Total Listings</h3>
                <div class="value">{total_listings}</div>
            </div>
            <div class="stat-card">
                <h3>Best Tundra Price</h3>
                <div class="value green">{f"${best_tundra:,}" if best_tundra else "N/A"}</div>
            </div>
            <div class="stat-card">
                <h3>Best F-150 Price</h3>
                <div class="value green">{f"${best_f150:,}" if best_f150 else "N/A"}</div>
            </div>
            <div class="stat-card">
                <h3>Price Drops (7 days)</h3>
                <div class="value">{len(price_drops)}</div>
            </div>
        </div>
"""

    # Price drops section
    html += """
        <section>
            <h2>Recent Price Drops</h2>
"""
    if price_drops:
        html += """
            <table>
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        <th>Dealer</th>
                        <th>Old Price</th>
                        <th>New Price</th>
                        <th>Savings</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
"""
        for drop in price_drops:
            savings = (drop["old_price"] or 0) - (drop["new_price"] or 0)
            vehicle = f"{drop['year']} {drop['make']} {drop['model']}"
            if drop.get("trim"):
                vehicle += f" {drop['trim']}"

            html += f"""
                    <tr class="price-drop">
                        <td><a href="{drop.get('listing_url', '#')}">{vehicle}</a></td>
                        <td>{drop.get('dealer_name', 'N/A')}</td>
                        <td>${drop['old_price']:,}</td>
                        <td>${drop['new_price']:,}</td>
                        <td class="savings">-${savings:,}</td>
                        <td>{drop['change_date'][:10]}</td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
"""
    else:
        html += '<p class="no-data">No price drops in the last 7 days</p>'

    html += """
        </section>
"""

    # Tundra listings
    html += """
        <section>
            <h2>Toyota Tundra Listings</h2>
"""
    if tundras:
        html += """
            <table>
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Trim</th>
                        <th>Price</th>
                        <th>MSRP</th>
                        <th>Dealer</th>
                        <th>Link</th>
                    </tr>
                </thead>
                <tbody>
"""
        for listing in tundras:
            msrp_display = f"${listing['msrp']:,}" if listing.get("msrp") else "N/A"
            price_display = f"${listing['price']:,}" if listing.get("price") else "N/A"
            html += f"""
                    <tr>
                        <td>{listing['year']}</td>
                        <td>{listing.get('trim', 'N/A')}</td>
                        <td class="price">{price_display}</td>
                        <td>{msrp_display}</td>
                        <td>{listing.get('dealer_name', 'N/A')}</td>
                        <td><a href="{listing.get('listing_url', '#')}" target="_blank">View</a></td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
"""
    else:
        html += '<p class="no-data">No Tundra listings found</p>'

    html += """
        </section>
"""

    # F-150 listings
    html += """
        <section>
            <h2>Ford F-150 Listings</h2>
"""
    if f150s:
        html += """
            <table>
                <thead>
                    <tr>
                        <th>Year</th>
                        <th>Trim</th>
                        <th>Price</th>
                        <th>MSRP</th>
                        <th>Dealer</th>
                        <th>Link</th>
                    </tr>
                </thead>
                <tbody>
"""
        for listing in f150s:
            msrp_display = f"${listing['msrp']:,}" if listing.get("msrp") else "N/A"
            price_display = f"${listing['price']:,}" if listing.get("price") else "N/A"
            html += f"""
                    <tr>
                        <td>{listing['year']}</td>
                        <td>{listing.get('trim', 'N/A')}</td>
                        <td class="price">{price_display}</td>
                        <td>{msrp_display}</td>
                        <td>{listing.get('dealer_name', 'N/A')}</td>
                        <td><a href="{listing.get('listing_url', '#')}" target="_blank">View</a></td>
                    </tr>
"""
        html += """
                </tbody>
            </table>
"""
    else:
        html += '<p class="no-data">No F-150 listings found</p>'

    html += """
        </section>
"""

    # Email templates reference
    html += """
        <section class="email-templates">
            <h2>Email Templates Reference</h2>

            <div class="template-section">
                <h3>1. Direct OTD Price Request</h3>
                <p>Use this for initial contact - straightforward ask for best price.</p>
                <pre>Subject: OTD Price Request - [Year] [Make] [Model] [Trim]

Hello,

I am interested in the [Year] [Make] [Model] [Trim] currently listed.
Stock #: [Stock Number]
Listed Price: $[Price]

Could you please provide your best out-the-door price including all taxes,
fees, and any available incentives/rebates? I have financing arranged externally.

I am a serious buyer looking to make a purchase decision within the next week.

Thank you,
[Your Name]</pre>
            </div>

            <div class="template-section">
                <h3>2. Competitive Leverage</h3>
                <p>Use when you have a quote from another dealer to leverage.</p>
                <pre>Subject: Price Match Request - [Year] [Make] [Model]

Hello,

I am looking to purchase a [Year] [Make] [Model] [Trim].

I have received an out-the-door quote of $[Competitor Price] from another
dealer in the area for a comparably equipped vehicle.

Can you match or beat this price? Please provide your best OTD price
including all taxes and fees.

I am ready to make a decision this week.

Thank you,
[Your Name]</pre>
            </div>

            <div class="template-section">
                <h3>3. Multi-Vehicle Inquiry</h3>
                <p>Use when a dealer has multiple vehicles you're interested in.</p>
                <pre>Subject: Quote Request - [Make] [Model] Inventory

Hello,

I noticed you have several [Make] [Model] vehicles in stock.
Could you please provide out-the-door pricing for:

1. [Year] [Trim] (Stock #[Number]) - Listed at $[Price]
2. [Year] [Trim] (Stock #[Number]) - Listed at $[Price]

Please include all taxes, fees, and incentives in your quotes.

Thank you,
[Your Name]</pre>
            </div>
        </section>
"""

    # Footer
    html += f"""
        <p class="updated">Report generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    </div>
</body>
</html>
"""

    # Write report
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\nHTML report generated: {REPORT_PATH}")


# =============================================================================
# MAIN FUNCTIONS
# =============================================================================


def run_full_scrape():
    """Run full scrape of all configured sources and vehicles."""
    print("=" * 60)
    print("TRUCK DEAL FINDER")
    print("=" * 60)

    init_database()

    stats = {
        "inserted": 0,
        "updated": 0,
        "unchanged": 0,
        "price_drops": 0,
    }

    all_listings = []

    # Scrape each vehicle from each source
    for vehicle in CONFIG["vehicles"]:
        # Cars.com
        cars_listings = scrape_cars_com(vehicle)
        all_listings.extend(cars_listings)

        random_delay()

        # CarGurus
        cargurus_listings = scrape_cargurus(vehicle)
        all_listings.extend(cargurus_listings)

        random_delay()

        # Autotrader
        autotrader_listings = scrape_autotrader(vehicle)
        all_listings.extend(autotrader_listings)

        random_delay()

    # Process all listings
    print("\n" + "=" * 60)
    print("PROCESSING LISTINGS")
    print("=" * 60)

    for listing in all_listings:
        action, price_changed = upsert_listing(listing)
        stats[action] += 1
        if price_changed:
            stats["price_drops"] += 1

    # Print summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"New listings found: {stats['inserted']}")
    print(f"Listings updated: {stats['updated']}")
    print(f"Price drops detected: {stats['price_drops']}")

    # Show active filters
    active_filters = get_active_filters_summary()
    if active_filters != "None":
        print(f"\nActive filters: {active_filters}")

    # Show top deals (filtered)
    tundras = get_listings(make="toyota", model="tundra")[:5]
    f150s = get_listings(make="ford", model="f-150")[:5]

    print(f"\n--- Top 5 Cheapest Tundras ({len(get_listings(make='toyota', model='tundra'))} total) ---")
    for i, t in enumerate(tundras, 1):
        print(f"{i}. ${t['price']:,} - {t['year']} {t.get('trim', 'N/A')} @ {t.get('dealer_name', 'Unknown')}")

    print(f"\n--- Top 5 Cheapest F-150s ({len(get_listings(make='ford', model='f-150'))} total) ---")
    for i, f in enumerate(f150s, 1):
        print(f"{i}. ${f['price']:,} - {f['year']} {f.get('trim', 'N/A')} @ {f.get('dealer_name', 'Unknown')}")

    # Generate report
    generate_html_report()


def show_price_drops():
    """Show recent price drops."""
    drops = get_price_drops(days=7)
    if not drops:
        print("No price drops in the last 7 days.")
        return

    print("\n--- Price Drops (Last 7 Days) ---")
    for drop in drops:
        savings = (drop["old_price"] or 0) - (drop["new_price"] or 0)
        print(f"{drop['year']} {drop['make']} {drop['model']} {drop.get('trim', '')}")
        print(f"  ${drop['old_price']:,} -> ${drop['new_price']:,} (save ${savings:,})")
        print(f"  Dealer: {drop.get('dealer_name', 'N/A')}")
        print()


def show_best_deals():
    """Show top 5 deals for each model."""
    print("\n--- Top 5 Tundras ---")
    tundras = get_listings(make="toyota", model="tundra")[:5]
    for i, t in enumerate(tundras, 1):
        print(f"{i}. [ID:{t['id']}] ${t['price']:,} - {t['year']} {t.get('trim', 'N/A')}")
        print(f"   Dealer: {t.get('dealer_name', 'Unknown')}")
        print(f"   URL: {t.get('listing_url', 'N/A')}")

    print("\n--- Top 5 F-150s ---")
    f150s = get_listings(make="ford", model="f-150")[:5]
    for i, f in enumerate(f150s, 1):
        print(f"{i}. [ID:{f['id']}] ${f['price']:,} - {f['year']} {f.get('trim', 'N/A')}")
        print(f"   Dealer: {f.get('dealer_name', 'Unknown')}")
        print(f"   URL: {f.get('listing_url', 'N/A')}")


def generate_email_for_listing(listing_id: int):
    """Generate email for a specific listing."""
    listing = get_listing_by_id(listing_id)
    if not listing:
        print(f"Listing ID {listing_id} not found.")
        return

    print(f"\n--- Email for: {listing['year']} {listing['make']} {listing['model']} ---")
    print(f"Dealer: {listing.get('dealer_name', 'Unknown')}")
    print(f"Price: ${listing['price']:,}" if listing.get("price") else "Price: N/A")

    email = generate_email_direct_otd(listing)
    print("\n" + "=" * 50)
    print("SUBJECT:", email["subject"])
    print("=" * 50)
    print(email["body"])


# =============================================================================
# CLI
# =============================================================================


def show_filters():
    """Show current filter configuration."""
    print("\n" + "=" * 60)
    print("CURRENT FILTERS")
    print("=" * 60)
    print(f"\nPrice range: ", end="")
    if FILTERS.get("price_min") or FILTERS.get("price_max"):
        min_p = f"${FILTERS['price_min']:,}" if FILTERS.get("price_min") else "None"
        max_p = f"${FILTERS['price_max']:,}" if FILTERS.get("price_max") else "None"
        print(f"{min_p} - {max_p}")
    else:
        print("No limit")

    print(f"Mileage max: {FILTERS.get('mileage_max', 'No limit') or 'No limit'}")

    print(f"Year range: ", end="")
    if FILTERS.get("year_min") or FILTERS.get("year_max"):
        print(f"{FILTERS.get('year_min', 'Any')} - {FILTERS.get('year_max', 'Any')}")
    else:
        print("No limit")

    print(f"\nTrim include: {FILTERS.get('trims_include') or 'All trims'}")
    print(f"Trim exclude: {FILTERS.get('trims_exclude') or 'None'}")
    print(f"Dealer include: {FILTERS.get('dealers_include') or 'All dealers'}")
    print(f"Dealer exclude: {FILTERS.get('dealers_exclude') or 'None'}")
    print(f"Keywords exclude: {FILTERS.get('keywords_exclude') or 'None'}")
    print(f"Min discount from MSRP: {FILTERS.get('min_discount_percent') or 'None'}%")
    print(f"Only price drops: {FILTERS.get('only_price_drops', False)}")

    print(f"\nActive: {get_active_filters_summary()}")


def main():
    parser = argparse.ArgumentParser(
        description="Truck Deal Finder - Find the best deals on new Toyota Tundras and Ford F-150s"
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Just regenerate HTML report from existing database",
    )
    parser.add_argument(
        "--email",
        type=int,
        metavar="LISTING_ID",
        help="Generate email for a specific listing ID",
    )
    parser.add_argument(
        "--drops",
        action="store_true",
        help="Show recent price drops",
    )
    parser.add_argument(
        "--best",
        action="store_true",
        help="Show top 5 deals for each model",
    )
    parser.add_argument(
        "--filters",
        action="store_true",
        help="Show current filter settings",
    )
    # Filter override arguments
    parser.add_argument(
        "--price-min",
        type=int,
        metavar="AMOUNT",
        help="Set minimum price filter (e.g., 40000)",
    )
    parser.add_argument(
        "--price-max",
        type=int,
        metavar="AMOUNT",
        help="Set maximum price filter (e.g., 70000)",
    )
    parser.add_argument(
        "--trim",
        type=str,
        metavar="TRIMS",
        help="Filter by trims (comma-separated, e.g., 'SR5,Limited,TRD')",
    )
    parser.add_argument(
        "--dealer",
        type=str,
        metavar="DEALERS",
        help="Filter by dealers (comma-separated, e.g., 'Toyota Escondido,Mossy')",
    )
    parser.add_argument(
        "--year",
        type=int,
        metavar="YEAR",
        help="Filter by minimum year (e.g., 2025)",
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="Disable all filters for this run",
    )

    args = parser.parse_args()

    # Apply CLI filter overrides
    if args.price_min:
        FILTERS["price_min"] = args.price_min
    if args.price_max:
        FILTERS["price_max"] = args.price_max
    if args.trim:
        FILTERS["trims_include"] = [t.strip() for t in args.trim.split(",")]
    if args.dealer:
        FILTERS["dealers_include"] = [d.strip() for d in args.dealer.split(",")]
    if args.year:
        FILTERS["year_min"] = args.year
    if args.no_filter:
        # Clear all filters
        for key in FILTERS:
            if isinstance(FILTERS[key], list):
                FILTERS[key] = []
            elif isinstance(FILTERS[key], bool):
                FILTERS[key] = False
            else:
                FILTERS[key] = None

    if args.filters:
        show_filters()
    elif args.report_only:
        init_database()
        generate_html_report()
    elif args.email:
        init_database()
        generate_email_for_listing(args.email)
    elif args.drops:
        init_database()
        show_price_drops()
    elif args.best:
        init_database()
        show_best_deals()
    else:
        run_full_scrape()


if __name__ == "__main__":
    main()
