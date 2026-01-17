'use client';

import { useState, useRef, useEffect } from 'react';
import type { FeatureOption } from '@/types';

interface FeatureSelectProps {
  label: string;
  categories: {
    name: string;
    features: FeatureOption[];
  }[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export default function FeatureSelect({
  label,
  categories,
  value,
  onChange,
  disabled = false,
}: FeatureSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFeature = (featureId: string) => {
    if (value.includes(featureId)) {
      onChange(value.filter(v => v !== featureId));
    } else {
      onChange([...value, featureId]);
    }
  };

  // Get label for a feature ID
  const getFeatureLabel = (id: string): string => {
    for (const category of categories) {
      const feature = category.features.find(f => f.id === id);
      if (feature) return feature.label;
    }
    return id;
  };

  const displayText = value.length === 0
    ? 'Select features...'
    : `${value.length} feature${value.length > 1 ? 's' : ''} selected`;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100' : 'cursor-pointer hover:border-gray-400'}
          flex items-center justify-between`}
      >
        <span className={value.length > 0 ? 'text-gray-900' : 'text-gray-500'}>
          {displayText}
        </span>
        <div className="flex items-center gap-1">
          {value.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="text-gray-400 hover:text-gray-600 p-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-auto">
          {categories.map((category) => (
            <div key={category.name}>
              <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide border-b">
                {category.name}
              </div>
              {category.features.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => toggleFeature(feature.id)}
                  className={`w-full px-3 py-2 text-left hover:bg-blue-50 text-sm flex items-center gap-2
                    ${value.includes(feature.id) ? 'bg-blue-100' : ''}`}
                >
                  <div className={`w-4 h-4 border rounded flex items-center justify-center
                    ${value.includes(feature.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {value.includes(feature.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={value.includes(feature.id) ? 'text-blue-800 font-medium' : 'text-gray-900'}>
                    {feature.label}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Selected features as tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {value.map((featureId) => (
            <span
              key={featureId}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full"
            >
              {getFeatureLabel(featureId)}
              <button
                type="button"
                onClick={() => onChange(value.filter(v => v !== featureId))}
                className="hover:text-green-600"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
