/**
 * Distance calculation utilities using Haversine formula
 * for approximate driving distance between two points.
 */

export interface Coordinates {
    lat: number;
    lng: number;
}

/**
 * Calculate straight-line distance between two coordinates using Haversine formula.
 * Returns distance in miles.
 */
export function haversineDistance(from: Coordinates, to: Coordinates): number {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(to.lat - from.lat);
    const dLng = toRad(to.lng - from.lng);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Estimate driving distance from straight-line distance.
 * Roads typically add ~30% to straight-line distance.
 */
export function estimateDrivingDistance(straightLineMiles: number): number {
    return straightLineMiles * 1.3;
}

/**
 * Average MPG by vehicle type (2025 estimates)
 */
export const VEHICLE_MPG: Record<string, { mpg: number; label: string }> = {
    compact: { mpg: 32, label: 'Compact (32 MPG)' },
    sedan: { mpg: 28, label: 'Sedan (28 MPG)' },
    suv: { mpg: 22, label: 'SUV (22 MPG)' },
    truck: { mpg: 18, label: 'Truck (18 MPG)' },
    van: { mpg: 20, label: 'Van (20 MPG)' },
    hybrid: { mpg: 45, label: 'Hybrid (45 MPG)' },
};

/**
 * Get MPG for a vehicle type
 */
export function getMpgForVehicle(vehicleType: string): number {
    return VEHICLE_MPG[vehicleType]?.mpg ?? 25;
}

/**
 * Calculate delivery fee based on round-trip distance, MPG, and gas price.
 * 
 * @param onewayMiles - One-way distance in miles
 * @param mpg - Vehicle miles per gallon
 * @param gasPriceCentsPerGallon - Gas price in cents (e.g., 405 for $4.05)
 * @returns Delivery fee in cents
 */
export function calculateDeliveryFee(
    onewayMiles: number,
    mpg: number,
    gasPriceCentsPerGallon: number
): number {
    if (mpg <= 0) return 0;

    const roundTripMiles = onewayMiles * 2;
    const gallonsUsed = roundTripMiles / mpg;
    const costCents = gallonsUsed * gasPriceCentsPerGallon;

    // Round to nearest 25 cents for cleaner pricing
    return Math.ceil(costCents / 25) * 25;
}

/**
 * Get current location using browser geolocation API.
 * Returns a promise that resolves to coordinates.
 */
export function getCurrentLocation(): Promise<Coordinates> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    });
}

/**
 * Simple geocoding using Nominatim (OpenStreetMap) - free, but has rate limits.
 * For production, consider caching or a paid service.
 */
export async function geocodeAddress(address: string): Promise<Coordinates | null> {
    try {
        const encoded = encodeURIComponent(address);
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'Balancey/1.0',
                },
            }
        );

        if (!response.ok) return null;

        const results = await response.json();
        if (results.length === 0) return null;

        return {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
        };
    } catch {
        return null;
    }
}
