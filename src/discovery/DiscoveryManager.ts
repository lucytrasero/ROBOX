import { generateId } from '../utils';
import type { Logger } from '../types';
import {
  RobotLocation,
  RobotService,
  ServiceType,
  ServiceSearchResult,
  ServiceSearchOptions,
  RegisterServiceOptions,
  UpdateLocationOptions,
} from './types';

/**
 * DiscoveryManager - service registry and location tracking
 */
export class DiscoveryManager {
  private locations: Map<string, RobotLocation> = new Map();
  private services: Map<string, RobotService> = new Map();
  private robotServices: Map<string, Set<string>> = new Map(); // robotId -> serviceIds
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  // ============================================
  // Location Management
  // ============================================

  /**
   * Update robot location
   */
  updateLocation(options: UpdateLocationOptions): RobotLocation {
    const location: RobotLocation = {
      robotId: options.robotId,
      latitude: options.latitude,
      longitude: options.longitude,
      altitude: options.altitude,
      accuracy: options.accuracy,
      heading: options.heading,
      speed: options.speed,
      updatedAt: new Date(),
    };

    this.locations.set(options.robotId, location);

    this.logger?.debug('Location updated', {
      robotId: options.robotId,
      lat: options.latitude,
      lng: options.longitude,
    });

    return { ...location };
  }

  /**
   * Get robot location
   */
  getLocation(robotId: string): RobotLocation | null {
    const location = this.locations.get(robotId);
    return location ? { ...location } : null;
  }

  /**
   * Remove robot location
   */
  removeLocation(robotId: string): boolean {
    return this.locations.delete(robotId);
  }

  /**
   * Get all locations
   */
  getAllLocations(): RobotLocation[] {
    return Array.from(this.locations.values()).map(l => ({ ...l }));
  }

  /**
   * Find nearby robots
   */
  findNearbyRobots(
    latitude: number,
    longitude: number,
    maxDistance: number = 1000 // meters
  ): Array<{ robotId: string; location: RobotLocation; distance: number }> {
    const results: Array<{ robotId: string; location: RobotLocation; distance: number }> = [];

    for (const location of this.locations.values()) {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      );

      if (distance <= maxDistance) {
        results.push({
          robotId: location.robotId,
          location: { ...location },
          distance,
        });
      }
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  // ============================================
  // Service Management
  // ============================================

  /**
   * Register a service
   */
  registerService(options: RegisterServiceOptions): RobotService {
    const now = new Date();

    const service: RobotService = {
      id: generateId(),
      robotId: options.robotId,
      serviceType: options.serviceType,
      name: options.name,
      description: options.description,
      price: options.price,
      currency: options.currency ?? 'TOKEN',
      available: true,
      capacity: options.capacity,
      currentLoad: 0,
      meta: options.meta,
      createdAt: now,
      updatedAt: now,
    };

    this.services.set(service.id, service);

    // Track robot's services
    if (!this.robotServices.has(options.robotId)) {
      this.robotServices.set(options.robotId, new Set());
    }
    this.robotServices.get(options.robotId)!.add(service.id);

    this.logger?.info('Service registered', {
      serviceId: service.id,
      robotId: options.robotId,
      type: options.serviceType,
    });

    return { ...service };
  }

  /**
   * Get service by ID
   */
  getService(id: string): RobotService | null {
    const service = this.services.get(id);
    return service ? { ...service } : null;
  }

  /**
   * Get services by robot
   */
  getRobotServices(robotId: string): RobotService[] {
    const serviceIds = this.robotServices.get(robotId);
    if (!serviceIds) return [];

    return Array.from(serviceIds)
      .map(id => this.services.get(id))
      .filter((s): s is RobotService => s !== undefined)
      .map(s => ({ ...s }));
  }

  /**
   * Update service
   */
  updateService(
    id: string,
    updates: Partial<Pick<RobotService, 'name' | 'description' | 'price' | 'available' | 'capacity' | 'currentLoad' | 'rating' | 'meta'>>
  ): RobotService | null {
    const service = this.services.get(id);
    if (!service) return null;

    Object.assign(service, updates, { updatedAt: new Date() });

    this.logger?.info('Service updated', { serviceId: id });

    return { ...service };
  }

  /**
   * Set service availability
   */
  setServiceAvailable(id: string, available: boolean): boolean {
    const service = this.services.get(id);
    if (!service) return false;

    service.available = available;
    service.updatedAt = new Date();

    return true;
  }

  /**
   * Remove service
   */
  removeService(id: string): boolean {
    const service = this.services.get(id);
    if (!service) return false;

    this.services.delete(id);
    this.robotServices.get(service.robotId)?.delete(id);

    this.logger?.info('Service removed', { serviceId: id });

    return true;
  }

  /**
   * Remove all services for robot
   */
  removeRobotServices(robotId: string): number {
    const serviceIds = this.robotServices.get(robotId);
    if (!serviceIds) return 0;

    let count = 0;
    for (const id of serviceIds) {
      if (this.services.delete(id)) count++;
    }

    this.robotServices.delete(robotId);
    return count;
  }

  // ============================================
  // Service Discovery
  // ============================================

  /**
   * Search for services
   */
  searchServices(options: ServiceSearchOptions = {}): ServiceSearchResult[] {
    let results: ServiceSearchResult[] = [];

    for (const service of this.services.values()) {
      // Filter by type
      if (options.serviceType && service.serviceType !== options.serviceType) continue;

      // Filter by availability
      if (options.availableOnly && !service.available) continue;

      // Filter by price
      if (options.maxPrice !== undefined && service.price > options.maxPrice) continue;

      // Filter by rating
      if (options.minRating !== undefined && (service.rating ?? 0) < options.minRating) continue;

      const result: ServiceSearchResult = { service: { ...service } };

      // Add location and distance if coordinates provided
      if (options.latitude !== undefined && options.longitude !== undefined) {
        const location = this.locations.get(service.robotId);
        if (location) {
          result.location = { ...location };
          result.distance = this.calculateDistance(
            options.latitude,
            options.longitude,
            location.latitude,
            location.longitude
          );

          // Filter by distance
          if (options.maxDistance !== undefined && result.distance > options.maxDistance) continue;

          // Estimate travel time (assuming 1 m/s average speed)
          result.estimatedTime = Math.round(result.distance);
        } else if (options.maxDistance !== undefined) {
          // Skip services without location if distance filter is set
          continue;
        }
      }

      results.push(result);
    }

    // Sort
    switch (options.sortBy) {
      case 'distance':
        results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
        break;
      case 'price':
        results.sort((a, b) => a.service.price - b.service.price);
        break;
      case 'rating':
        results.sort((a, b) => (b.service.rating ?? 0) - (a.service.rating ?? 0));
        break;
      default:
        // Default: distance if available, otherwise price
        results.sort((a, b) => {
          if (a.distance !== undefined && b.distance !== undefined) {
            return a.distance - b.distance;
          }
          return a.service.price - b.service.price;
        });
    }

    // Limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Find nearest service of type
   */
  findNearest(
    serviceType: ServiceType,
    latitude: number,
    longitude: number,
    options: { availableOnly?: boolean; maxDistance?: number } = {}
  ): ServiceSearchResult | null {
    const results = this.searchServices({
      serviceType,
      latitude,
      longitude,
      maxDistance: options.maxDistance,
      availableOnly: options.availableOnly ?? true,
      sortBy: 'distance',
      limit: 1,
    });

    return results[0] ?? null;
  }

  /**
   * Find cheapest service of type
   */
  findCheapest(
    serviceType: ServiceType,
    options: { availableOnly?: boolean; maxPrice?: number } = {}
  ): ServiceSearchResult | null {
    const results = this.searchServices({
      serviceType,
      maxPrice: options.maxPrice,
      availableOnly: options.availableOnly ?? true,
      sortBy: 'price',
      limit: 1,
    });

    return results[0] ?? null;
  }

  /**
   * Find best rated service of type
   */
  findBestRated(
    serviceType: ServiceType,
    options: { availableOnly?: boolean; minRating?: number } = {}
  ): ServiceSearchResult | null {
    const results = this.searchServices({
      serviceType,
      minRating: options.minRating,
      availableOnly: options.availableOnly ?? true,
      sortBy: 'rating',
      limit: 1,
    });

    return results[0] ?? null;
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalLocations: number;
    totalServices: number;
    availableServices: number;
    byServiceType: Record<ServiceType, number>;
  } {
    const services = Array.from(this.services.values());
    
    const byServiceType: Record<ServiceType, number> = {
      [ServiceType.CHARGING]: 0,
      [ServiceType.REPAIR]: 0,
      [ServiceType.PARTS]: 0,
      [ServiceType.STORAGE]: 0,
      [ServiceType.COMPUTE]: 0,
      [ServiceType.DATA]: 0,
      [ServiceType.TRANSPORT]: 0,
      [ServiceType.CLEANING]: 0,
      [ServiceType.SECURITY]: 0,
      [ServiceType.CUSTOM]: 0,
    };

    for (const service of services) {
      byServiceType[service.serviceType]++;
    }

    return {
      totalLocations: this.locations.size,
      totalServices: services.length,
      availableServices: services.filter(s => s.available).length,
      byServiceType,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.locations.clear();
    this.services.clear();
    this.robotServices.clear();
  }
}
