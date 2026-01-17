'use client';

import { useState, useEffect } from 'react';
import Dropdown from '@/components/common/Dropdown';
import MultiSelect from '@/components/common/MultiSelect';
import FeatureSelect from '@/components/common/FeatureSelect';
import type { Filters, FilterOptions } from '@/types';

interface FilterPanelProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  onApply: () => void;
  onClear: () => void;
}

const initialFilterOptions: FilterOptions = {
  makes: ['Toyota', 'Ford'],
  models: { Toyota: ['Tundra'], Ford: ['F-150'] },
  trims: {
    Toyota: ['SR', 'SR5', 'Limited', 'Platinum', '1794', 'TRD Pro', 'Capstone'],
    Ford: ['XL', 'XLT', 'STX', 'Lariat', 'King Ranch', 'Platinum', 'Limited', 'Tremor', 'Raptor'],
  },
  trimsFromDb: { Toyota: [], Ford: [] },
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
      { id: 'has_premium_sound', label: 'Premium Sound' },
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
      { id: 'has_adaptive_cruise', label: 'Adaptive Cruise' },
    ],
    towing: [
      { id: 'has_tow_package', label: 'Towing Package' },
      { id: 'has_max_tow', label: 'Max Tow (10,000+ lbs)' },
    ],
    offroad: [
      { id: 'has_offroad_package', label: 'Off-Road Package' },
    ],
  },
  years: [2026, 2025, 2024],
  exteriorColors: [],
  interiorColors: [],
  dealers: [],
  priceRange: { min: 30000, max: 100000 },
};

export default function FilterPanel({ filters, onFiltersChange, onApply, onClear }: FilterPanelProps) {
  const [options, setOptions] = useState<FilterOptions>(initialFilterOptions);
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch filter options from API
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const response = await fetch('/api/filter-options');
        if (response.ok) {
          const data = await response.json();
          setOptions(prev => ({
            ...prev,
            ...data,
            // Merge DB trims with static trims
            trims: {
              Toyota: [...new Set([...prev.trims.Toyota, ...(data.trimsFromDb?.Toyota || [])])],
              Ford: [...new Set([...prev.trims.Ford, ...(data.trimsFromDb?.Ford || [])])],
            },
          }));
        }
      } catch (error) {
        console.error('Failed to fetch filter options:', error);
      }
    };

    fetchOptions();
  }, []);

  // Update a single filter value
  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    const newFilters = { ...filters, [key]: value };

    // Reset dependent filters when make changes
    if (key === 'make' && value !== filters.make) {
      newFilters.trim = [];
      newFilters.cabType = [];
      newFilters.engine = [];
    }

    onFiltersChange(newFilters);
  };

  // Get options based on current make selection
  const getCurrentMake = () => filters.make || 'Toyota';
  const trimOptions = options.trims[getCurrentMake()] || [];
  const cabTypeOptions = options.cabTypes[getCurrentMake()] || [];
  const engineOptions = options.engines[getCurrentMake()] || [];

  // Count active filters
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== '';
  }).length;

  // Feature categories for FeatureSelect
  const featureCategories = [
    { name: 'Comfort', features: options.features.comfort },
    { name: 'Technology', features: options.features.technology },
    { name: 'Safety', features: options.features.safety },
    { name: 'Towing', features: options.features.towing },
    { name: 'Off-Road', features: options.features.offroad },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between border-b hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-semibold text-gray-800">Build Your Dream Truck</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="p-6">
          {/* Primary Filters Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Dropdown
              label="Make"
              options={options.makes}
              value={filters.make}
              onChange={(value) => updateFilter('make', value)}
              placeholder="All Makes"
            />
            <Dropdown
              label="Model"
              options={filters.make ? (options.models[filters.make] || []) : ['Tundra', 'F-150']}
              value={filters.model}
              onChange={(value) => updateFilter('model', value)}
              placeholder="All Models"
              disabled={!filters.make}
            />
            <Dropdown
              label="Min Year"
              options={options.years.map(String)}
              value={filters.yearMin}
              onChange={(value) => updateFilter('yearMin', value)}
              placeholder="Any Year"
            />
            <Dropdown
              label="Max Year"
              options={options.years.map(String)}
              value={filters.yearMax}
              onChange={(value) => updateFilter('yearMax', value)}
              placeholder="Any Year"
            />
          </div>

          {/* Configuration Filters */}
          <div className="border-t pt-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Vehicle Configuration</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MultiSelect
                label="Trim Level"
                options={trimOptions}
                value={filters.trim}
                onChange={(value) => updateFilter('trim', value)}
                placeholder="All Trims"
              />
              <MultiSelect
                label="Cab Type"
                options={cabTypeOptions}
                value={filters.cabType}
                onChange={(value) => updateFilter('cabType', value)}
                placeholder="All Cabs"
              />
              <MultiSelect
                label="Bed Length"
                options={options.bedLengths.map(b => `${b}'`)}
                value={filters.bedLength}
                onChange={(value) => updateFilter('bedLength', value.map(v => v.replace("'", '')))}
                placeholder="All Lengths"
              />
              <MultiSelect
                label="Drivetrain"
                options={options.drivetrains}
                value={filters.drivetrain}
                onChange={(value) => updateFilter('drivetrain', value)}
                placeholder="All"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <MultiSelect
                label="Engine"
                options={engineOptions}
                value={filters.engine}
                onChange={(value) => updateFilter('engine', value)}
                placeholder="All Engines"
              />
              <MultiSelect
                label="Exterior Color"
                options={options.exteriorColors}
                value={filters.exteriorColor}
                onChange={(value) => updateFilter('exteriorColor', value)}
                placeholder="All Colors"
                disabled={options.exteriorColors.length === 0}
              />
              <MultiSelect
                label="Interior Color"
                options={options.interiorColors}
                value={filters.interiorColor}
                onChange={(value) => updateFilter('interiorColor', value)}
                placeholder="All Colors"
                disabled={options.interiorColors.length === 0}
              />
              <MultiSelect
                label="Dealer"
                options={options.dealers}
                value={filters.dealer}
                onChange={(value) => updateFilter('dealer', value)}
                placeholder="All Dealers"
                disabled={options.dealers.length === 0}
              />
            </div>
          </div>

          {/* Price Range */}
          <div className="border-t pt-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Price Range</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Price</label>
                <input
                  type="number"
                  value={filters.priceMin}
                  onChange={(e) => updateFilter('priceMin', e.target.value)}
                  placeholder={`$${options.priceRange.min.toLocaleString()}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Price</label>
                <input
                  type="number"
                  value={filters.priceMax}
                  onChange={(e) => updateFilter('priceMax', e.target.value)}
                  placeholder={`$${options.priceRange.max.toLocaleString()}`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="border-t pt-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Must-Have Features</h3>
            <FeatureSelect
              label="Select Features"
              categories={featureCategories}
              value={filters.features}
              onChange={(value) => updateFilter('features', value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onApply}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Search Trucks
            </button>
            <button
              onClick={onClear}
              className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
