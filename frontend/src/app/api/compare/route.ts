import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), '..', 'truck_deals.db');

interface ListingRow {
  id: number;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  price: number | null;
  msrp: number | null;
  mileage: number | null;
  dealer_name: string;
  listing_url: string | null;
  first_seen: string;
  last_seen: string;
  cab_type: string | null;
  bed_length: string | null;
  drivetrain: string | null;
  engine: string | null;
  exterior_color: string | null;
  interior_color: string | null;
  has_moonroof: number | null;
  has_leather: number | null;
  has_heated_seats: number | null;
  has_ventilated_seats: number | null;
  has_premium_sound: number | null;
  has_power_tailgate: number | null;
  has_navigation: number | null;
  has_360_camera: number | null;
  has_hud: number | null;
  has_wireless_charging: number | null;
  has_blind_spot: number | null;
  has_lane_keep: number | null;
  has_adaptive_cruise: number | null;
  has_tow_package: number | null;
  has_max_tow: number | null;
  has_offroad_package: number | null;
  vin: string | null;
  stock_number: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json(
      { error: 'Missing required parameter: ids' },
      { status: 400 }
    );
  }

  const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

  if (ids.length === 0) {
    return NextResponse.json(
      { error: 'No valid IDs provided' },
      { status: 400 }
    );
  }

  if (ids.length > 4) {
    return NextResponse.json(
      { error: 'Maximum 4 vehicles can be compared at once' },
      { status: 400 }
    );
  }

  try {
    const db = new Database(DB_PATH, { readonly: true });

    const placeholders = ids.map(() => '?').join(',');
    const query = `
      SELECT
        id, make, model, year, trim, price, msrp, mileage,
        dealer_name, listing_url, first_seen, last_seen,
        cab_type, bed_length, drivetrain, engine,
        exterior_color, interior_color,
        has_moonroof, has_leather, has_heated_seats, has_ventilated_seats,
        has_premium_sound, has_power_tailgate, has_navigation, has_360_camera,
        has_hud, has_wireless_charging, has_blind_spot, has_lane_keep,
        has_adaptive_cruise, has_tow_package, has_max_tow, has_offroad_package,
        vin, stock_number
      FROM listings
      WHERE id IN (${placeholders})
    `;

    const listings = db.prepare(query).all(...ids) as ListingRow[];
    db.close();

    // Sort by the order of IDs provided
    const sortedListings = ids.map(id => listings.find(l => l.id === id)).filter(Boolean);

    return NextResponse.json(sortedListings);
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings for comparison' },
      { status: 500 }
    );
  }
}
