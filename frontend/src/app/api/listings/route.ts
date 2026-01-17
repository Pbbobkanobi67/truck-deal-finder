import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

// Database path - adjust for your deployment
const DB_PATH = path.join(process.cwd(), '..', 'truck_deals.db');

interface Listing {
  id: number;
  source: string;
  listing_id: string;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  price: number | null;
  msrp: number | null;
  mileage: number | null;
  dealer_name: string | null;
  dealer_phone: string | null;
  dealer_address: string | null;
  listing_url: string | null;
  vin: string | null;
  stock_number: string | null;
  first_seen: string;
  last_seen: string;
  price_history: string;
  // Enhanced vehicle specs
  cab_type: string | null;
  bed_length: string | null;
  drivetrain: string | null;
  engine: string | null;
  exterior_color: string | null;
  interior_color: string | null;
  features: string | null;
  // Feature flags
  has_moonroof: number;
  has_leather: number;
  has_heated_seats: number;
  has_ventilated_seats: number;
  has_premium_sound: number;
  has_power_tailgate: number;
  has_navigation: number;
  has_360_camera: number;
  has_hud: number;
  has_wireless_charging: number;
  has_blind_spot: number;
  has_lane_keep: number;
  has_adaptive_cruise: number;
  has_tow_package: number;
  has_max_tow: number;
  has_offroad_package: number;
}

interface PriceAlert {
  id: number;
  listing_id: number;
  old_price: number;
  new_price: number;
  change_date: string;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  dealer_name: string | null;
  listing_url: string | null;
}

// Feature flag column names
const FEATURE_FLAGS = [
  'has_moonroof', 'has_leather', 'has_heated_seats', 'has_ventilated_seats',
  'has_premium_sound', 'has_power_tailgate', 'has_navigation', 'has_360_camera',
  'has_hud', 'has_wireless_charging', 'has_blind_spot', 'has_lane_keep',
  'has_adaptive_cruise', 'has_tow_package', 'has_max_tow', 'has_offroad_package'
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Basic filters
  const make = searchParams.get('make');
  const model = searchParams.get('model');
  const priceMin = searchParams.get('priceMin');
  const priceMax = searchParams.get('priceMax');
  const yearMin = searchParams.get('yearMin');
  const yearMax = searchParams.get('yearMax');
  const trim = searchParams.get('trim');

  // Enhanced filters
  const cabType = searchParams.get('cabType');
  const bedLength = searchParams.get('bedLength');
  const drivetrain = searchParams.get('drivetrain');
  const engine = searchParams.get('engine');
  const exteriorColor = searchParams.get('exteriorColor');
  const interiorColor = searchParams.get('interiorColor');
  const dealer = searchParams.get('dealer');
  const features = searchParams.get('features'); // comma-separated feature flags

  // Special query types
  const type = searchParams.get('type') || 'listings'; // 'listings', 'stats', 'drops'

  try {
    const db = new Database(DB_PATH, { readonly: true });

    if (type === 'stats') {
      const tundraCount = db.prepare(`
        SELECT COUNT(*) as count FROM listings
        WHERE LOWER(make) = 'toyota' AND LOWER(model) = 'tundra'
      `).get() as { count: number };

      const f150Count = db.prepare(`
        SELECT COUNT(*) as count FROM listings
        WHERE LOWER(make) = 'ford' AND LOWER(model) = 'f-150'
      `).get() as { count: number };

      const bestTundra = db.prepare(`
        SELECT MIN(price) as price FROM listings
        WHERE LOWER(make) = 'toyota' AND LOWER(model) = 'tundra' AND price IS NOT NULL
      `).get() as { price: number | null };

      const bestF150 = db.prepare(`
        SELECT MIN(price) as price FROM listings
        WHERE LOWER(make) = 'ford' AND LOWER(model) = 'f-150' AND price IS NOT NULL
      `).get() as { price: number | null };

      const priceDrops = db.prepare(`
        SELECT COUNT(*) as count FROM price_alerts
        WHERE change_date >= datetime('now', '-7 days')
      `).get() as { count: number };

      // Feature stats
      const featureStats = db.prepare(`
        SELECT
          SUM(has_moonroof) as moonroof,
          SUM(has_leather) as leather,
          SUM(has_navigation) as navigation,
          SUM(has_tow_package) as tow_package,
          SUM(has_offroad_package) as offroad
        FROM listings
      `).get() as Record<string, number>;

      db.close();

      return NextResponse.json({
        tundraCount: tundraCount.count,
        f150Count: f150Count.count,
        bestTundra: bestTundra.price,
        bestF150: bestF150.price,
        priceDrops: priceDrops.count,
        totalListings: tundraCount.count + f150Count.count,
        featureStats,
      });
    }

    if (type === 'drops') {
      const drops = db.prepare(`
        SELECT pa.*, l.make, l.model, l.year, l.trim, l.dealer_name, l.listing_url,
               l.cab_type, l.bed_length, l.drivetrain, l.exterior_color
        FROM price_alerts pa
        JOIN listings l ON pa.listing_id = l.id
        WHERE pa.change_date >= datetime('now', '-7 days')
        ORDER BY pa.change_date DESC
      `).all() as PriceAlert[];

      db.close();
      return NextResponse.json(drops);
    }

    // Build query for listings with all filters
    let query = 'SELECT * FROM listings WHERE 1=1';
    const params: (string | number)[] = [];

    // Basic filters
    if (make) {
      query += ' AND LOWER(make) = LOWER(?)';
      params.push(make);
    }
    if (model) {
      query += ' AND LOWER(model) = LOWER(?)';
      params.push(model);
    }
    if (priceMin) {
      query += ' AND price >= ?';
      params.push(parseInt(priceMin));
    }
    if (priceMax) {
      query += ' AND price <= ?';
      params.push(parseInt(priceMax));
    }
    if (yearMin) {
      query += ' AND year >= ?';
      params.push(parseInt(yearMin));
    }
    if (yearMax) {
      query += ' AND year <= ?';
      params.push(parseInt(yearMax));
    }

    // Trim filter (comma-separated, partial match)
    if (trim) {
      const trims = trim.split(',').map(t => t.trim().toLowerCase());
      const trimConditions = trims.map(() => 'LOWER(trim) LIKE ?').join(' OR ');
      query += ` AND (${trimConditions})`;
      trims.forEach(t => params.push(`%${t}%`));
    }

    // Cab type filter (comma-separated)
    if (cabType) {
      const cabTypes = cabType.split(',').map(c => c.trim());
      const cabConditions = cabTypes.map(() => 'cab_type = ?').join(' OR ');
      query += ` AND (${cabConditions})`;
      cabTypes.forEach(c => params.push(c));
    }

    // Bed length filter (comma-separated)
    if (bedLength) {
      const bedLengths = bedLength.split(',').map(b => b.trim());
      const bedConditions = bedLengths.map(() => 'bed_length = ?').join(' OR ');
      query += ` AND (${bedConditions})`;
      bedLengths.forEach(b => params.push(b));
    }

    // Drivetrain filter (comma-separated)
    if (drivetrain) {
      const drivetrains = drivetrain.split(',').map(d => d.trim());
      const driveConditions = drivetrains.map(() => 'drivetrain = ?').join(' OR ');
      query += ` AND (${driveConditions})`;
      drivetrains.forEach(d => params.push(d));
    }

    // Engine filter (comma-separated)
    if (engine) {
      const engines = engine.split(',').map(e => e.trim());
      const engineConditions = engines.map(() => 'engine = ?').join(' OR ');
      query += ` AND (${engineConditions})`;
      engines.forEach(e => params.push(e));
    }

    // Color filters
    if (exteriorColor) {
      const colors = exteriorColor.split(',').map(c => c.trim().toLowerCase());
      const colorConditions = colors.map(() => 'LOWER(exterior_color) LIKE ?').join(' OR ');
      query += ` AND (${colorConditions})`;
      colors.forEach(c => params.push(`%${c}%`));
    }
    if (interiorColor) {
      const colors = interiorColor.split(',').map(c => c.trim().toLowerCase());
      const colorConditions = colors.map(() => 'LOWER(interior_color) LIKE ?').join(' OR ');
      query += ` AND (${colorConditions})`;
      colors.forEach(c => params.push(`%${c}%`));
    }

    // Dealer filter
    if (dealer) {
      const dealers = dealer.split(',').map(d => d.trim().toLowerCase());
      const dealerConditions = dealers.map(() => 'LOWER(dealer_name) LIKE ?').join(' OR ');
      query += ` AND (${dealerConditions})`;
      dealers.forEach(d => params.push(`%${d}%`));
    }

    // Feature flags filter (comma-separated feature flag names)
    if (features) {
      const requestedFeatures = features.split(',').map(f => f.trim());
      for (const feature of requestedFeatures) {
        if (FEATURE_FLAGS.includes(feature)) {
          query += ` AND ${feature} = 1`;
        }
      }
    }

    query += ' ORDER BY price ASC';

    const listings = db.prepare(query).all(...params) as Listing[];
    db.close();

    return NextResponse.json(listings);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data', details: String(error) },
      { status: 500 }
    );
  }
}
