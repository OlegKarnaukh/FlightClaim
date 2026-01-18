/**
 * FlightClaim UI Components
 * Shared components for web and mobile
 */

// Theme colors
export const colors = {
  primary: '#667eea',
  primaryDark: '#764ba2',
  secondary: '#ffd700',
  white: '#ffffff',
  black: '#000000',
  gray: {
    100: '#f7fafc',
    200: '#edf2f7',
    300: '#e2e8f0',
    400: '#cbd5e0',
    500: '#a0aec0',
    600: '#718096',
    700: '#4a5568',
    800: '#2d3748',
    900: '#1a202c',
  },
  success: '#48bb78',
  warning: '#ed8936',
  error: '#f56565',
} as const;

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

// Typography
export const typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },
  fontWeights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

// Compensation display helpers
export function formatCompensation(amount: number): string {
  return `€${amount}`;
}

export function formatDelay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function formatFlightNumber(flightNumber: string): string {
  // Ensure proper formatting: "FR1234" or "FR 1234"
  return flightNumber.replace(/\s+/g, '').toUpperCase();
}

// Status types for claims
export type ClaimStatus =
  | 'found'        // Flight found in emails
  | 'eligible'     // Eligible for compensation
  | 'not_eligible' // Not eligible (no delay, etc.)
  | 'pending'      // Claim submitted, waiting
  | 'paid'         // Payment received
  | 'rejected';    // Claim rejected

export function getStatusColor(status: ClaimStatus): string {
  switch (status) {
    case 'found':
      return colors.gray[500];
    case 'eligible':
      return colors.secondary;
    case 'not_eligible':
      return colors.gray[400];
    case 'pending':
      return colors.warning;
    case 'paid':
      return colors.success;
    case 'rejected':
      return colors.error;
    default:
      return colors.gray[500];
  }
}

export function getStatusLabel(status: ClaimStatus): string {
  switch (status) {
    case 'found':
      return 'Found';
    case 'eligible':
      return 'Eligible';
    case 'not_eligible':
      return 'Not Eligible';
    case 'pending':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Unknown';
  }
}
