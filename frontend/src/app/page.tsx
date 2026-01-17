'use client';

import { useState, useEffect, useCallback } from 'react';

interface Listing {
  id: number;
  source: string;
  make: string;
  model: string;
  year: number;
  trim: string | null;
  price: number | null;
  msrp: number | null;
  dealer_name: string | null;
  listing_url: string | null;
  first_seen: string;
}

interface Stats {
  tundraCount: number;
  f150Count: number;
  bestTundra: number | null;
  bestF150: number | null;
  priceDrops: number;
  totalListings: number;
}

interface PriceDrop {
  id: number;
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

interface Filters {
  priceMin: string;
  priceMax: string;
  yearMin: string;
  trim: string;
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tundras, setTundras] = useState<Listing[]>([]);
  const [f150s, setF150s] = useState<Listing[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tundra' | 'f150'>('tundra');
  const [filters, setFilters] = useState<Filters>({
    priceMin: '',
    priceMax: '',
    yearMin: '',
    trim: '',
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    priceMin: '',
    priceMax: '',
    yearMin: '',
    trim: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (appliedFilters.priceMin) params.set('priceMin', appliedFilters.priceMin);
      if (appliedFilters.priceMax) params.set('priceMax', appliedFilters.priceMax);
      if (appliedFilters.yearMin) params.set('yearMin', appliedFilters.yearMin);
      if (appliedFilters.trim) params.set('trim', appliedFilters.trim);

      // Fetch stats
      const statsRes = await fetch('/api/listings?type=stats');
      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch Tundras
      const tundraParams = new URLSearchParams(params);
      tundraParams.set('make', 'toyota');
      tundraParams.set('model', 'tundra');
      const tundraRes = await fetch(`/api/listings?${tundraParams}`);
      if (!tundraRes.ok) throw new Error('Failed to fetch Tundras');
      const tundraData = await tundraRes.json();
      setTundras(tundraData);

      // Fetch F-150s
      const f150Params = new URLSearchParams(params);
      f150Params.set('make', 'ford');
      f150Params.set('model', 'f-150');
      const f150Res = await fetch(`/api/listings?${f150Params}`);
      if (!f150Res.ok) throw new Error('Failed to fetch F-150s');
      const f150Data = await f150Res.json();
      setF150s(f150Data);

      // Fetch price drops
      const dropsRes = await fetch('/api/listings?type=drops');
      if (!dropsRes.ok) throw new Error('Failed to fetch price drops');
      const dropsData = await dropsRes.json();
      setPriceDrops(dropsData);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    const empty = { priceMin: '', priceMax: '', yearMin: '', trim: '' };
    setFilters(empty);
    setAppliedFilters(empty);
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'N/A';
    return `$${price.toLocaleString()}`;
  };

  const hasActiveFilters = Object.values(appliedFilters).some(v => v !== '');

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Truck Deal Finder</h1>
          <p className="text-gray-600 mt-1">
            Best deals on new Toyota Tundras and Ford F-150s near San Diego
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <strong>Error:</strong> {error}
            <p className="text-sm mt-1">Make sure the Python scraper has been run and truck_deals.db exists.</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Total Listings</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {loading ? '...' : stats?.totalListings || 0}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Best Tundra</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {loading ? '...' : formatPrice(stats?.bestTundra || null)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Best F-150</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {loading ? '...' : formatPrice(stats?.bestF150 || null)}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Price Drops (7d)</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">
              {loading ? '...' : stats?.priceDrops || 0}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 border mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Price</label>
              <input
                type="number"
                placeholder="e.g., 40000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={filters.priceMin}
                onChange={(e) => setFilters({ ...filters, priceMin: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Price</label>
              <input
                type="number"
                placeholder="e.g., 70000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={filters.priceMax}
                onChange={(e) => setFilters({ ...filters, priceMax: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Year</label>
              <input
                type="number"
                placeholder="e.g., 2025"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={filters.yearMin}
                onChange={(e) => setFilters({ ...filters, yearMin: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trims</label>
              <input
                type="text"
                placeholder="e.g., SR5, Limited"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={filters.trim}
                onChange={(e) => setFilters({ ...filters, trim: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Clear
              </button>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              <strong>Active filters:</strong>{' '}
              {appliedFilters.priceMin && `Min $${parseInt(appliedFilters.priceMin).toLocaleString()}`}
              {appliedFilters.priceMax && ` Max $${parseInt(appliedFilters.priceMax).toLocaleString()}`}
              {appliedFilters.yearMin && ` Year ≥${appliedFilters.yearMin}`}
              {appliedFilters.trim && ` Trims: ${appliedFilters.trim}`}
            </div>
          )}
        </div>

        {/* Price Drops Section */}
        {priceDrops.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border mb-8 overflow-hidden">
            <div className="p-6 border-b bg-orange-50">
              <h2 className="text-lg font-semibold text-gray-900">Recent Price Drops</h2>
              <p className="text-sm text-gray-600">Vehicles with price reductions in the last 7 days</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Old Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">New Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Savings</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dealer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {priceDrops.map((drop) => (
                    <tr key={drop.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <a
                          href={drop.listing_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {drop.year} {drop.make} {drop.model} {drop.trim}
                        </a>
                      </td>
                      <td className="px-6 py-4 text-gray-500 line-through">
                        {formatPrice(drop.old_price)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-green-600">
                        {formatPrice(drop.new_price)}
                      </td>
                      <td className="px-6 py-4 font-bold text-green-600">
                        -${(drop.old_price - drop.new_price).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{drop.dealer_name || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Listings Tabs */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="border-b">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('tundra')}
                className={`flex-1 px-6 py-4 text-center font-medium transition ${
                  activeTab === 'tundra'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Toyota Tundra ({tundras.length})
              </button>
              <button
                onClick={() => setActiveTab('f150')}
                className={`flex-1 px-6 py-4 text-center font-medium transition ${
                  activeTab === 'f150'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Ford F-150 ({f150s.length})
              </button>
            </nav>
          </div>

          {/* Listings Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                Loading listings...
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trim</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">MSRP</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dealer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(activeTab === 'tundra' ? tundras : f150s).map((listing) => (
                    <tr key={listing.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium">{listing.year}</td>
                      <td className="px-6 py-4">{listing.trim || 'N/A'}</td>
                      <td className="px-6 py-4 font-bold text-green-600">
                        {formatPrice(listing.price)}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {formatPrice(listing.msrp)}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{listing.dealer_name || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {listing.source}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {listing.listing_url ? (
                          <a
                            href={listing.listing_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </td>
                    </tr>
                  ))}
                  {(activeTab === 'tundra' ? tundras : f150s).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        No listings found. {hasActiveFilters && 'Try adjusting your filters.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-gray-500 text-sm">
          <p>Data sourced from Cars.com | Last updated: {new Date().toLocaleDateString()}</p>
          <p className="mt-1">Run <code className="bg-gray-100 px-2 py-1 rounded">python deal_finder.py</code> to refresh data</p>
        </footer>
      </div>
    </main>
  );
}
