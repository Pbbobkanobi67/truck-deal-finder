// Listing interface with all vehicle specs
export interface Listing {
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

export interface Stats {
  tundraCount: number;
  f150Count: number;
  bestTundra: number | null;
  bestF150: number | null;
  priceDrops: number;
  totalListings: number;
  featureStats?: {
    moonroof: number;
    leather: number;
    navigation: number;
    tow_package: number;
    offroad: number;
  };
}

export interface PriceDrop {
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
  cab_type?: string | null;
  bed_length?: string | null;
  drivetrain?: string | null;
  exterior_color?: string | null;
}

// Filter state interface
export interface Filters {
  make: string;
  model: string;
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  trim: string[];
  cabType: string[];
  bedLength: string[];
  drivetrain: string[];
  engine: string[];
  exteriorColor: string[];
  interiorColor: string[];
  dealer: string[];
  features: string[];
}

// Feature option for multi-select
export interface FeatureOption {
  id: string;
  label: string;
}

// Feature category for grouped features
export interface FeatureCategory {
  name: string;
  features: FeatureOption[];
}

// Filter options from API
export interface FilterOptions {
  makes: string[];
  models: Record<string, string[]>;
  trims: Record<string, string[]>;
  trimsFromDb: Record<string, string[]>;
  cabTypes: Record<string, string[]>;
  bedLengths: string[];
  drivetrains: string[];
  engines: Record<string, string[]>;
  features: {
    comfort: FeatureOption[];
    technology: FeatureOption[];
    safety: FeatureOption[];
    towing: FeatureOption[];
    offroad: FeatureOption[];
  };
  years: number[];
  exteriorColors: string[];
  interiorColors: string[];
  dealers: string[];
  priceRange: {
    min: number;
    max: number;
  };
}

// Comparison item for side-by-side view
export interface ComparisonItem extends Listing {
  selected: boolean;
}
