'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import FilterPanel from '@/components/filters/FilterPanel';
import EmailComposer from '@/components/email/EmailComposer';
import CommunicationHistory from '@/components/email/CommunicationHistory';
import ComparisonTool from '@/components/comparison/ComparisonTool';
import type { Listing, Stats, PriceDrop, Filters } from '@/types';

const initialFilters: Filters = {
  make: '',
  model: '',
  yearMin: '',
  yearMax: '',
  priceMin: '',
  priceMax: '',
  trim: [],
  cabType: [],
  bedLength: [],
  drivetrain: [],
  engine: [],
  exteriorColor: [],
  interiorColor: [],
  dealer: [],
  features: [],
};

export default function Home() {
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [priceDrops, setPriceDrops] = useState<PriceDrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'toyota' | 'ford'>('all');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [compareList, setCompareList] = useState<number[]>([]);

  // Email state
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showCommunicationHistory, setShowCommunicationHistory] = useState(false);

  // Comparison state
  const [showComparison, setShowComparison] = useState(false);

  // Build query params from filters
  const buildQueryParams = useCallback((baseFilters: Filters, make?: string, model?: string) => {
    const params = new URLSearchParams();

    if (make) params.set('make', make);
    else if (baseFilters.make) params.set('make', baseFilters.make);

    if (model) params.set('model', model);
    else if (baseFilters.model) params.set('model', baseFilters.model);

    if (baseFilters.priceMin) params.set('priceMin', baseFilters.priceMin);
    if (baseFilters.priceMax) params.set('priceMax', baseFilters.priceMax);
    if (baseFilters.yearMin) params.set('yearMin', baseFilters.yearMin);
    if (baseFilters.yearMax) params.set('yearMax', baseFilters.yearMax);
    if (baseFilters.trim.length > 0) params.set('trim', baseFilters.trim.join(','));
    if (baseFilters.cabType.length > 0) params.set('cabType', baseFilters.cabType.join(','));
    if (baseFilters.bedLength.length > 0) params.set('bedLength', baseFilters.bedLength.join(','));
    if (baseFilters.drivetrain.length > 0) params.set('drivetrain', baseFilters.drivetrain.join(','));
    if (baseFilters.engine.length > 0) params.set('engine', baseFilters.engine.join(','));
    if (baseFilters.exteriorColor.length > 0) params.set('exteriorColor', baseFilters.exteriorColor.join(','));
    if (baseFilters.interiorColor.length > 0) params.set('interiorColor', baseFilters.interiorColor.join(','));
    if (baseFilters.dealer.length > 0) params.set('dealer', baseFilters.dealer.join(','));
    if (baseFilters.features.length > 0) params.set('features', baseFilters.features.join(','));

    return params.toString();
  }, []);

  // Fetch data based on filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch stats
      const statsRes = await fetch('/api/listings?type=stats');
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch listings based on active tab and filters
      let listingsUrl = '/api/listings';
      const queryParams = buildQueryParams(appliedFilters);

      if (activeTab === 'toyota') {
        listingsUrl += `?make=toyota&model=tundra${queryParams ? '&' + queryParams : ''}`;
      } else if (activeTab === 'ford') {
        listingsUrl += `?make=ford&model=f-150${queryParams ? '&' + queryParams : ''}`;
      } else if (queryParams) {
        listingsUrl += '?' + queryParams;
      }

      const listingsRes = await fetch(listingsUrl);
      const listingsData = await listingsRes.json();
      setListings(listingsData);

      // Fetch price drops
      const dropsRes = await fetch('/api/listings?type=drops');
      const dropsData = await dropsRes.json();
      setPriceDrops(dropsData);
    } catch (err) {
      setError('Failed to load data. Please try again.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, appliedFilters, buildQueryParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setAppliedFilters(initialFilters);
  };

  const toggleCompare = (id: number) => {
    if (compareList.includes(id)) {
      setCompareList(compareList.filter(i => i !== id));
    } else if (compareList.length < 3) {
      setCompareList([...compareList, id]);
    }
  };

  const openEmailComposer = (listing: Listing) => {
    setSelectedListing(listing);
    setShowEmailComposer(true);
  };

  const handleEmailSent = () => {
    // Optionally refresh data or show notification
    console.log('Email sent successfully');
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return 'N/A';
    return `$${price.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // Get feature badges for a listing
  const getFeatureBadges = (listing: Listing) => {
    const badges = [];
    if (listing.has_moonroof) badges.push('Moonroof');
    if (listing.has_leather) badges.push('Leather');
    if (listing.has_navigation) badges.push('Nav');
    if (listing.has_tow_package) badges.push('Tow Pkg');
    if (listing.has_offroad_package) badges.push('Off-Road');
    if (listing.has_premium_sound) badges.push('Premium Audio');
    return badges.slice(0, 4); // Max 4 badges
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Truck Deal Finder</h1>
              <p className="text-gray-600">Find the best deals on Toyota Tundras and Ford F-150s near San Diego</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Gmail Status */}
              {status === 'loading' ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : session ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCommunicationHistory(true)}
                    className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Emails
                  </button>
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {session.user?.email}
                    <button
                      onClick={() => signOut()}
                      className="ml-1 text-green-600 hover:text-green-800"
                      title="Disconnect Gmail"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => signIn('google')}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Connect Gmail
                </button>
              )}

              {/* Compare button */}
              {compareList.length > 0 && (
                <button
                  onClick={() => setShowComparison(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare ({compareList.length})
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Toyota Tundras</p>
              <p className="text-3xl font-bold text-gray-900">{stats.tundraCount}</p>
              {stats.bestTundra && (
                <p className="text-sm text-green-600 mt-1">From {formatPrice(stats.bestTundra)}</p>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Ford F-150s</p>
              <p className="text-3xl font-bold text-gray-900">{stats.f150Count}</p>
              {stats.bestF150 && (
                <p className="text-sm text-green-600 mt-1">From {formatPrice(stats.bestF150)}</p>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Total Listings</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalListings}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6 border">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Price Drops (7d)</p>
              <p className="text-3xl font-bold text-orange-600">{stats.priceDrops}</p>
            </div>
          </div>
        )}

        {/* Filter Panel */}
        <FilterPanel
          filters={filters}
          onFiltersChange={setFilters}
          onApply={applyFilters}
          onClear={clearFilters}
        />

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Price Drops Section */}
        {priceDrops.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                </svg>
                Recent Price Drops
              </h2>
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
                  {priceDrops.slice(0, 5).map((drop) => (
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
                      <td className="px-6 py-4 text-gray-500 line-through">{formatPrice(drop.old_price)}</td>
                      <td className="px-6 py-4 font-semibold text-green-600">{formatPrice(drop.new_price)}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-sm rounded-full">
                          -{formatPrice(drop.old_price - drop.new_price)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{drop.dealer_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Listings Tabs */}
        <div className="bg-white rounded-xl shadow-sm border">
          <div className="border-b">
            <div className="flex">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-6 py-4 font-medium transition ${
                  activeTab === 'all'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                All Trucks ({stats?.totalListings || 0})
              </button>
              <button
                onClick={() => setActiveTab('toyota')}
                className={`px-6 py-4 font-medium transition ${
                  activeTab === 'toyota'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Toyota Tundra ({stats?.tundraCount || 0})
              </button>
              <button
                onClick={() => setActiveTab('ford')}
                className={`px-6 py-4 font-medium transition ${
                  activeTab === 'ford'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Ford F-150 ({stats?.f150Count || 0})
              </button>
            </div>
          </div>

          {/* Listings Table */}
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              Loading listings...
            </div>
          ) : listings.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No listings found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        disabled
                        title="Select all"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Configuration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Features</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dealer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {listings.map((listing) => {
                    const savings = listing.msrp && listing.price
                      ? listing.msrp - listing.price
                      : null;
                    const badges = getFeatureBadges(listing);

                    return (
                      <tr
                        key={listing.id}
                        className={`hover:bg-gray-50 transition ${
                          compareList.includes(listing.id) ? 'bg-green-50' : ''
                        }`}
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={compareList.includes(listing.id)}
                            onChange={() => toggleCompare(listing.id)}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            disabled={!compareList.includes(listing.id) && compareList.length >= 3}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={listing.listing_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium block"
                          >
                            {listing.year} {listing.make} {listing.model}
                          </a>
                          <span className="text-sm text-gray-600">{listing.trim}</span>
                          {listing.exterior_color && (
                            <span className="text-xs text-gray-500 block">{listing.exterior_color}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          <div className="space-y-1">
                            {listing.cab_type && <div>{listing.cab_type}</div>}
                            {listing.bed_length && <div>{listing.bed_length}&apos; bed</div>}
                            {listing.drivetrain && (
                              <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                                {listing.drivetrain}
                              </span>
                            )}
                            {listing.engine && <div className="text-xs">{listing.engine}</div>}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {badges.map((badge) => (
                              <span
                                key={badge}
                                className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                              >
                                {badge}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-semibold text-gray-900">{formatPrice(listing.price)}</span>
                          {listing.msrp && listing.price && listing.msrp > listing.price && (
                            <div>
                              <span className="text-xs text-gray-500 line-through">
                                MSRP {formatPrice(listing.msrp)}
                              </span>
                              {savings && savings > 0 && (
                                <span className="text-xs text-green-600 ml-1">
                                  Save {formatPrice(savings)}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-gray-900">{listing.dealer_name}</div>
                          <div className="text-xs text-gray-500">First seen: {formatDate(listing.first_seen)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <a
                              href={listing.listing_url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                            >
                              View
                            </a>
                            <button
                              onClick={() => openEmailComposer(listing)}
                              className="px-3 py-1 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition"
                            >
                              Email
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Results count */}
          {!loading && listings.length > 0 && (
            <div className="px-6 py-4 border-t bg-gray-50 text-sm text-gray-600">
              Showing {listings.length} listing{listings.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm py-4">
          <p>Data scraped from Cars.com. Run `python deal_finder.py --fetch-details` to get enhanced vehicle specs.</p>
          <p className="mt-1">Refresh data: `python deal_finder.py`</p>
        </footer>
      </main>

      {/* Email Composer Modal */}
      {showEmailComposer && (
        <EmailComposer
          listing={selectedListing}
          onClose={() => {
            setShowEmailComposer(false);
            setSelectedListing(null);
          }}
          onSent={handleEmailSent}
          isAuthenticated={!!session}
          onSignIn={() => signIn('google')}
        />
      )}

      {/* Communication History Modal */}
      {showCommunicationHistory && (
        <CommunicationHistory onClose={() => setShowCommunicationHistory(false)} />
      )}

      {/* Comparison Tool Modal */}
      {showComparison && (
        <ComparisonTool
          listingIds={compareList}
          onClose={() => setShowComparison(false)}
          onRemove={(id) => {
            setCompareList(compareList.filter(i => i !== id));
            if (compareList.length <= 1) {
              setShowComparison(false);
            }
          }}
        />
      )}
    </div>
  );
}
