/**
 * Robot location
 */
export interface RobotLocation {
  robotId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;        // meters
  heading?: number;         // degrees 0-360
  speed?: number;           // m/s
  updatedAt: Date;
}

/**
 * Service offered by a robot
 */
export interface RobotService {
  id: string;
  robotId: string;
  serviceType: ServiceType;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  available: boolean;
  capacity?: number;        // e.g., charging slots
  currentLoad?: number;     // current usage
  rating?: number;          // average rating
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service types
 */
export enum ServiceType {
  CHARGING = 'CHARGING',
  REPAIR = 'REPAIR',
  PARTS = 'PARTS',
  STORAGE = 'STORAGE',
  COMPUTE = 'COMPUTE',
  DATA = 'DATA',
  TRANSPORT = 'TRANSPORT',
  CLEANING = 'CLEANING',
  SECURITY = 'SECURITY',
  CUSTOM = 'CUSTOM',
}

/**
 * Service search result
 */
export interface ServiceSearchResult {
  service: RobotService;
  location?: RobotLocation;
  distance?: number;        // meters from search point
  estimatedTime?: number;   // seconds to reach
}

/**
 * Search options
 */
export interface ServiceSearchOptions {
  serviceType?: ServiceType;
  latitude?: number;
  longitude?: number;
  maxDistance?: number;     // meters
  minRating?: number;
  maxPrice?: number;
  availableOnly?: boolean;
  limit?: number;
  sortBy?: 'distance' | 'price' | 'rating';
}

/**
 * Register service options
 */
export interface RegisterServiceOptions {
  robotId: string;
  serviceType: ServiceType;
  name: string;
  description?: string;
  price: number;
  currency?: string;
  capacity?: number;
  meta?: Record<string, unknown>;
}

/**
 * Update location options
 */
export interface UpdateLocationOptions {
  robotId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}
