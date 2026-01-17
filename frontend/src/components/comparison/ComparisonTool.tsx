'use client';

import { useState, useEffect } from 'react';
import type { Listing } from '@/types';

interface ComparisonToolProps {
  listingIds: number[];
  onClose: () => void;
  onRemove: (id: number) => void;
}

interface ComparisonRow {
  label: string;
  key: string;
  format?: (value: unknown, listing: Listing) => string | React.ReactNode;
  highlight?: 'lower' | 'higher' | 'boolean';
}

const COMPARISON_SECTIONS: { title: string; rows: ComparisonRow[] }[] = [
  {
    title: 'Basic Info',
    rows: [
      { label: 'Year', key: 'year' },
      { label: 'Make', key: 'make' },
      { label: 'Model', key: 'model' },
      { label: 'Trim', key: 'trim' },
      {
        label: 'Price',
        key: 'price',
        format: (v) => v ? `$${(v as number).toLocaleString()}` : 'N/A',
        highlight: 'lower',
      },
      {
        label: 'MSRP',
        key: 'msrp',
        format: (v) => v ? `$${(v as number).toLocaleString()}` : 'N/A',
      },
      {
        label: 'Savings',
        key: 'savings',
        format: (_, listing) => {
          if (listing.msrp && listing.price && listing.msrp > listing.price) {
            const savings = listing.msrp - listing.price;
            return <span className="text-green-600 font-medium">-${savings.toLocaleString()}</span>;
          }
          return 'N/A';
        },
        highlight: 'higher',
      },
      {
        label: 'Mileage',
        key: 'mileage',
        format: (v) => v ? `${(v as number).toLocaleString()} mi` : 'N/A',
        highlight: 'lower',
      },
    ],
  },
  {
    title: 'Configuration',
    rows: [
      { label: 'Cab Type', key: 'cab_type', format: (v) => (v as string) || 'N/A' },
      { label: 'Bed Length', key: 'bed_length', format: (v) => v ? `${v}'` : 'N/A' },
      { label: 'Drivetrain', key: 'drivetrain', format: (v) => (v as string) || 'N/A' },
      { label: 'Engine', key: 'engine', format: (v) => (v as string) || 'N/A' },
      { label: 'Exterior Color', key: 'exterior_color', format: (v) => (v as string) || 'N/A' },
      { label: 'Interior Color', key: 'interior_color', format: (v) => (v as string) || 'N/A' },
    ],
  },
  {
    title: 'Comfort & Convenience',
    rows: [
      { label: 'Moonroof', key: 'has_moonroof', highlight: 'boolean' },
      { label: 'Leather Seats', key: 'has_leather', highlight: 'boolean' },
      { label: 'Heated Seats', key: 'has_heated_seats', highlight: 'boolean' },
      { label: 'Ventilated Seats', key: 'has_ventilated_seats', highlight: 'boolean' },
      { label: 'Premium Sound', key: 'has_premium_sound', highlight: 'boolean' },
      { label: 'Power Tailgate', key: 'has_power_tailgate', highlight: 'boolean' },
      { label: 'Wireless Charging', key: 'has_wireless_charging', highlight: 'boolean' },
    ],
  },
  {
    title: 'Technology & Safety',
    rows: [
      { label: 'Navigation', key: 'has_navigation', highlight: 'boolean' },
      { label: '360 Camera', key: 'has_360_camera', highlight: 'boolean' },
      { label: 'Head-Up Display', key: 'has_hud', highlight: 'boolean' },
      { label: 'Blind Spot Monitor', key: 'has_blind_spot', highlight: 'boolean' },
      { label: 'Lane Keep Assist', key: 'has_lane_keep', highlight: 'boolean' },
      { label: 'Adaptive Cruise', key: 'has_adaptive_cruise', highlight: 'boolean' },
    ],
  },
  {
    title: 'Capability',
    rows: [
      { label: 'Tow Package', key: 'has_tow_package', highlight: 'boolean' },
      { label: 'Max Tow Package', key: 'has_max_tow', highlight: 'boolean' },
      { label: 'Off-Road Package', key: 'has_offroad_package', highlight: 'boolean' },
    ],
  },
  {
    title: 'Dealer Info',
    rows: [
      { label: 'Dealer', key: 'dealer_name' },
      { label: 'Stock #', key: 'stock_number', format: (v) => (v as string) || 'N/A' },
      { label: 'VIN', key: 'vin', format: (v) => (v as string) || 'N/A' },
      {
        label: 'Days Listed',
        key: 'first_seen',
        format: (v) => {
          if (!v) return 'N/A';
          const days = Math.floor((Date.now() - new Date(v as string).getTime()) / (1000 * 60 * 60 * 24));
          return `${days} days`;
        },
      },
    ],
  },
];

export default function ComparisonTool({ listingIds, onClose, onRemove }: ComparisonToolProps) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (listingIds.length === 0) {
      setListings([]);
      setLoading(false);
      return;
    }

    const fetchListings = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/compare?ids=${listingIds.join(',')}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setListings(data);
      } catch (err) {
        setError('Failed to load comparison data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [listingIds]);

  const getValue = (listing: Listing, key: string): unknown => {
    return (listing as unknown as Record<string, unknown>)[key];
  };

  const getBestValue = (key: string, highlight?: 'lower' | 'higher' | 'boolean'): unknown => {
    if (!highlight || listings.length < 2) return null;

    const values = listings.map(l => getValue(l, key)).filter(v => v !== null && v !== undefined);
    if (values.length === 0) return null;

    if (highlight === 'boolean') {
      return values.some(v => v === 1 || v === true) ? true : null;
    }

    const numericValues = values.filter(v => typeof v === 'number') as number[];
    if (numericValues.length === 0) return null;

    if (highlight === 'lower') {
      return Math.min(...numericValues);
    } else {
      return Math.max(...numericValues);
    }
  };

  const renderCell = (listing: Listing, row: ComparisonRow) => {
    const value = getValue(listing, row.key);
    const bestValue = getBestValue(row.key, row.highlight);

    let content: React.ReactNode;
    let isBest = false;

    if (row.highlight === 'boolean') {
      const hasTrait = value === 1 || value === true;
      content = hasTrait ? (
        <svg className="w-5 h-5 text-green-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
      isBest = hasTrait && bestValue === true;
    } else if (row.format) {
      content = row.format(value, listing);
      if (row.highlight && typeof value === 'number' && value === bestValue) {
        isBest = true;
      }
    } else {
      content = value !== null && value !== undefined ? String(value) : 'N/A';
    }

    return (
      <td
        key={listing.id}
        className={`px-4 py-2 text-center ${
          isBest ? 'bg-green-50 font-medium' : ''
        }`}
      >
        {content}
      </td>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-semibold text-gray-900">Compare Trucks</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              Loading comparison...
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">{error}</div>
          ) : listings.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No vehicles selected for comparison.</p>
              <p className="text-sm mt-2">Select up to 3 vehicles using the checkboxes in the listings table.</p>
            </div>
          ) : (
            <table className="w-full">
              {/* Vehicle Headers */}
              <thead className="bg-white sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-4 text-left text-sm font-medium text-gray-500 w-40 bg-gray-50">
                    Vehicle
                  </th>
                  {listings.map((listing) => (
                    <th key={listing.id} className="px-4 py-4 text-center min-w-[200px]">
                      <div className="space-y-2">
                        <div className="font-semibold text-gray-900">
                          {listing.year} {listing.make}
                        </div>
                        <div className="text-sm text-gray-600">
                          {listing.model} {listing.trim}
                        </div>
                        <div className="flex justify-center gap-2">
                          <a
                            href={listing.listing_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                          >
                            View Listing
                          </a>
                          <button
                            onClick={() => onRemove(listing.id)}
                            className="px-3 py-1 border border-red-300 text-red-600 text-xs rounded hover:bg-red-50 transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {COMPARISON_SECTIONS.map((section) => (
                  <>
                    {/* Section Header */}
                    <tr key={`section-${section.title}`} className="bg-gray-100">
                      <td
                        colSpan={listings.length + 1}
                        className="px-4 py-2 font-semibold text-gray-700 text-sm uppercase tracking-wide"
                      >
                        {section.title}
                      </td>
                    </tr>

                    {/* Section Rows */}
                    {section.rows.map((row) => (
                      <tr key={row.key} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50">
                          {row.label}
                        </td>
                        {listings.map((listing) => renderCell(listing, row))}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {listings.length > 0 && (
              <>
                <span className="inline-block w-3 h-3 bg-green-50 border border-green-200 rounded mr-1"></span>
                Green highlights indicate the best value in each category
              </>
            )}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
