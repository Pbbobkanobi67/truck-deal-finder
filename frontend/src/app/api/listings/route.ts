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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const make = searchParams.get('make');
  const model = searchParams.get('model');
  const priceMin = searchParams.get('priceMin');
  const priceMax = searchParams.get('priceMax');
  const yearMin = searchParams.get('yearMin');
  const trim = searchParams.get('trim');
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

      db.close();

      return NextResponse.json({
        tundraCount: tundraCount.count,
        f150Count: f150Count.count,
        bestTundra: bestTundra.price,
        bestF150: bestF150.price,
        priceDrops: priceDrops.count,
        totalListings: tundraCount.count + f150Count.count,
      });
    }

    if (type === 'drops') {
      const drops = db.prepare(`
        SELECT pa.*, l.make, l.model, l.year, l.trim, l.dealer_name, l.listing_url
        FROM price_alerts pa
        JOIN listings l ON pa.listing_id = l.id
        WHERE pa.change_date >= datetime('now', '-7 days')
        ORDER BY pa.change_date DESC
      `).all() as PriceAlert[];

      db.close();
      return NextResponse.json(drops);
    }

    // Build query for listings
    let query = 'SELECT * FROM listings WHERE 1=1';
    const params: (string | number)[] = [];

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
    if (trim) {
      const trims = trim.split(',').map(t => t.trim().toLowerCase());
      const trimConditions = trims.map(() => 'LOWER(trim) LIKE ?').join(' OR ');
      query += ` AND (${trimConditions})`;
      trims.forEach(t => params.push(`%${t}%`));
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
