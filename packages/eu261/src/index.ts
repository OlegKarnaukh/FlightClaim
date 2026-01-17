/**
 * EU261/2004 Compensation Calculator
 *
 * Regulation (EC) No 261/2004 establishes rules for compensation
 * when flights are delayed or cancelled.
 */

export interface FlightData {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: Date;
  actualArrival: Date;
  scheduledArrival: Date;
  distanceKm: number;
  passengerName?: string;
  bookingReference?: string;
}

export interface CompensationResult {
  eligible: boolean;
  amount: number;
  currency: 'EUR';
  delayMinutes: number;
  reason: string;
}

/**
 * Calculate delay in minutes between scheduled and actual arrival
 */
export function calculateDelayMinutes(
  scheduledArrival: Date,
  actualArrival: Date
): number {
  const diffMs = actualArrival.getTime() - scheduledArrival.getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

/**
 * Calculate EU261 compensation based on distance and delay
 *
 * Rules:
 * - Distance ≤ 1,500 km: €250 (delay ≥ 2h for short, but typically 3h for compensation)
 * - Distance 1,500–3,500 km: €400 (delay ≥ 3h)
 * - Distance > 3,500 km: €300 (delay 3-4h) or €600 (delay > 4h)
 *
 * Note: Compensation is typically only paid for delays of 3+ hours at arrival
 */
export function calculateCompensation(
  distanceKm: number,
  delayMinutes: number
): CompensationResult {
  // Minimum 3 hours delay for compensation
  if (delayMinutes < 180) {
    return {
      eligible: false,
      amount: 0,
      currency: 'EUR',
      delayMinutes,
      reason: `Delay of ${delayMinutes} minutes is less than 3 hours minimum`,
    };
  }

  let amount: number;
  let reason: string;

  if (distanceKm <= 1500) {
    amount = 250;
    reason = `Short-haul flight (${distanceKm}km) with ${Math.floor(delayMinutes / 60)}h delay`;
  } else if (distanceKm <= 3500) {
    amount = 400;
    reason = `Medium-haul flight (${distanceKm}km) with ${Math.floor(delayMinutes / 60)}h delay`;
  } else {
    // Long-haul: €300 for 3-4h delay, €600 for >4h
    if (delayMinutes >= 240) {
      amount = 600;
      reason = `Long-haul flight (${distanceKm}km) with ${Math.floor(delayMinutes / 60)}h+ delay`;
    } else {
      amount = 300;
      reason = `Long-haul flight (${distanceKm}km) with 3-4h delay (reduced compensation)`;
    }
  }

  return {
    eligible: true,
    amount,
    currency: 'EUR',
    delayMinutes,
    reason,
  };
}

/**
 * Calculate compensation for a flight
 */
export function calculateFlightCompensation(flight: FlightData): CompensationResult {
  const delayMinutes = calculateDelayMinutes(
    flight.scheduledArrival,
    flight.actualArrival
  );
  return calculateCompensation(flight.distanceKm, delayMinutes);
}

/**
 * Statute of limitations by country (in years)
 */
export const STATUTE_OF_LIMITATIONS: Record<string, number> = {
  DE: 3, // Germany - 3 years (end of year)
  IT: 2, // Italy - 2 years
  FR: 5, // France - 5 years
  ES: 5, // Spain - 5 years
  NL: 2, // Netherlands - 2 years
  BE: 1, // Belgium - 1 year
  AT: 3, // Austria - 3 years
  UK: 6, // UK - 6 years
};

/**
 * Check if claim is still within statute of limitations
 */
export function isWithinStatuteOfLimitations(
  flightDate: Date,
  countryCode: string
): boolean {
  const limitYears = STATUTE_OF_LIMITATIONS[countryCode.toUpperCase()] || 3;
  const limitDate = new Date();
  limitDate.setFullYear(limitDate.getFullYear() - limitYears);
  return flightDate >= limitDate;
}

/**
 * Supported airlines for email parsing
 */
export const SUPPORTED_AIRLINES = [
  { code: 'FR', name: 'Ryanair', domain: 'ryanair.com' },
  { code: 'LH', name: 'Lufthansa', domain: 'lufthansa.com' },
  { code: 'U2', name: 'EasyJet', domain: 'easyjet.com' },
  { code: 'W6', name: 'Wizz Air', domain: 'wizzair.com' },
  { code: 'VY', name: 'Vueling', domain: 'vueling.com' },
] as const;

export type AirlineCode = typeof SUPPORTED_AIRLINES[number]['code'];
