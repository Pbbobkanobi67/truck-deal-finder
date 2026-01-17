import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '..', 'truck_deals.db');

// Static options for dropdowns that don't need to be queried from DB
const STATIC_OPTIONS = {
  makes: ['Toyota', 'Ford'],
  models: {
    Toyota: ['Tundra'],
    Ford: ['F-150'],
  },
  trims: {
    Toyota: ['SR', 'SR5', 'Limited', 'Platinum', '1794', 'TRD Pro', 'Capstone'],
    Ford: ['XL', 'XLT', 'STX', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Tremor', 'Raptor'],
  },
  cabTypes: {
    Toyota: ['Double Cab', 'CrewMax'],
    Ford: ['Regular Cab', 'SuperCab', 'SuperCrew'],
  },
  bedLengths: ['5.5', '6.5', '8'],
  drivetrains: ['2WD', '4WD'],
  engines: {
    Toyota: ['3.5L Twin-Turbo V6', 'i-FORCE MAX Hybrid'],
    Ford: ['2.7L EcoBoost', '3.3L V6', '3.5L EcoBoost', '3.5L PowerBoost', '5.0L V8'],
  },
  features: {
    comfort: [
      { id: 'has_moonroof', label: 'Moonroof/Sunroof' },
      { id: 'has_leather', label: 'Leather Seats' },
      { id: 'has_heated_seats', label: 'Heated Seats' },
      { id: 'has_ventilated_seats', label: 'Ventilated Seats' },
      { id: 'has_premium_sound', label: 'Premium Sound System' },
      { id: 'has_power_tailgate', label: 'Power Tailgate' },
    ],
    technology: [
      { id: 'has_navigation', label: 'Navigation' },
      { id: 'has_360_camera', label: '360-Degree Camera' },
      { id: 'has_hud', label: 'Head-Up Display' },
      { id: 'has_wireless_charging', label: 'Wireless Charging' },
    ],
    safety: [
      { id: 'has_blind_spot', label: 'Blind Spot Monitor' },
      { id: 'has_lane_keep', label: 'Lane Keep Assist' },
      { id: 'has_adaptive_cruise', label: 'Adaptive Cruise Control' },
    ],
    towing: [
      { id: 'has_tow_package', label: 'Towing Package' },
      { id: 'has_max_tow', label: 'Max Tow (10,000+ lbs)' },
    ],
    offroad: [
      { id: 'has_offroad_package', label: 'Off-Road Package' },
    ],
  },
};

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Get distinct values from database for dynamic options
    const years = db.prepare(`
      SELECT DISTINCT year FROM listings
      WHERE year IS NOT NULL
      ORDER BY year DESC
    `).all() as { year: number }[];

    const exteriorColors = db.prepare(`
      SELECT DISTINCT exterior_color FROM listings
      WHERE exterior_color IS NOT NULL AND exterior_color != ''
      ORDER BY exterior_color
    `).all() as { exterior_color: string }[];

    const interiorColors = db.prepare(`
      SELECT DISTINCT interior_color FROM listings
      WHERE interior_color IS NOT NULL AND interior_color != ''
      ORDER BY interior_color
    `).all() as { interior_color: string }[];

    const dealers = db.prepare(`
      SELECT DISTINCT dealer_name FROM listings
      WHERE dealer_name IS NOT NULL AND dealer_name != ''
      ORDER BY dealer_name
    `).all() as { dealer_name: string }[];

    // Get actual trims from database (may differ from static)
    const dbTrims = db.prepare(`
      SELECT DISTINCT make, trim FROM listings
      WHERE trim IS NOT NULL AND trim != ''
      ORDER BY make, trim
    `).all() as { make: string; trim: string }[];

    // Group trims by make
    const trimsByMake: Record<string, string[]> = { Toyota: [], Ford: [] };
    for (const row of dbTrims) {
      const makeKey = row.make.charAt(0).toUpperCase() + row.make.slice(1).toLowerCase();
      if (trimsByMake[makeKey]) {
        if (!trimsByMake[makeKey].includes(row.trim)) {
          trimsByMake[makeKey].push(row.trim);
        }
      }
    }

    // Get price range
    const priceRange = db.prepare(`
      SELECT MIN(price) as minPrice, MAX(price) as maxPrice
      FROM listings WHERE price IS NOT NULL
    `).get() as { minPrice: number; maxPrice: number };

    db.close();

    return NextResponse.json({
      ...STATIC_OPTIONS,
      // Override with actual DB values where available
      trimsFromDb: trimsByMake,
      years: years.map(y => y.year),
      exteriorColors: exteriorColors.map(c => c.exterior_color),
      interiorColors: interiorColors.map(c => c.interior_color),
      dealers: dealers.map(d => d.dealer_name),
      priceRange: {
        min: priceRange.minPrice || 30000,
        max: priceRange.maxPrice || 100000,
      },
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch filter options', details: String(error) },
      { status: 500 }
    );
  }
}
