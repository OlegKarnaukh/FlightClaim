import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';

// ============================================================================
// LEVEL 1: GMAIL API FILTER
// ============================================================================

const AIRLINE_DOMAINS = [
  'ryanair.com', 'ryanairmail.com', 'rfrmail.com', // Ryanair uses multiple domains
  'easyjet.com', 'mail.easyjet.com',
  'lufthansa.com', 'wizzair.com', 'vueling.com',
  'airbaltic.com', 'klm.com', 'airfrance.com', 'britishairways.com', 'iberia.com',
  'turkishairlines.com', 'emirates.com', 'qatarairways.com', 'flypgs.com',
  'pegasus.com', 'bangkokair.com', 'aeroflot.ru', 's7.ru', 'norwegian.com',
];

const OTA_DOMAINS = [
  'trip.com', 'booking.com', 'expedia.com', 'skyscanner.com', 'kayak.com', 'kiwi.com',
];

// Content patterns for forwarded emails
const CONTENT_PATTERNS = [
  '"Ryanair DAC"', '"ryanairmail.com"', '"Ryanair Travel"',
  '"easyJet"', '"easyjet.com"', '"EZY"', '"EJU"',
  '"Trip.com"', '"Бронирование авиабилета"', '"электронные билеты"',
  '"flight confirmation"', '"booking reference"', '"e-ticket"',
  '"Pegasus"', '"flypgs"',
];

// Build Gmail search query
function buildGmailQuery(yearsBack: number = 3): string {
  const afterDate = new Date();
  afterDate.setFullYear(afterDate.getFullYear() - yearsBack);
  const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');

  const fromQueries = [...AIRLINE_DOMAINS, ...OTA_DOMAINS].map(d => `from:${d}`);
  const subjectKeywords = ['flight', 'booking', 'confirmation', 'itinerary', 'e-ticket', 'reservation', 'рейс', 'бронирование'];
  const subjectQueries = subjectKeywords.map(k => `subject:${k}`);

  return `(${fromQueries.join(' OR ')} OR ${subjectQueries.join(' OR ')} OR ${CONTENT_PATTERNS.join(' OR ')}) after:${dateStr}`;
}

// ============================================================================
// LEVEL 2: JSON-LD PARSING (Schema.org FlightReservation)
// ============================================================================

interface FlightData {
  flightNumber: string;
  airline: string;
  from: string;
  to: string;
  departureTime: string;
  bookingRef: string;
  passengerName?: string;
  confidence: number;
}

function parseJsonLD(html: string): FlightData[] {
  const flights: FlightData[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] === 'FlightReservation' && item.reservationFor) {
          const flight = item.reservationFor;
          flights.push({
            flightNumber: `${flight.airline?.iataCode || ''}${flight.flightNumber || ''}`,
            airline: flight.airline?.iataCode || flight.airline?.name || '',
            from: flight.departureAirport?.iataCode || '',
            to: flight.arrivalAirport?.iataCode || '',
            departureTime: flight.departureTime || '',
            bookingRef: item.reservationNumber || '',
            passengerName: item.underName?.name || '',
            confidence: 100, // JSON-LD = highest confidence
          });
        }
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return flights;
}

// ============================================================================
// LEVEL 3: REGEX FALLBACK
// ============================================================================

// Valid airline IATA codes (2 letters)
const AIRLINE_CODES = new Set([
  'FR', 'U2', 'LH', 'W6', 'VY', 'BT', 'KL', 'AF', 'BA', 'IB', 'TK', 'EK', 'QR',
  'PC', 'PG', 'SU', 'S7', 'U6', 'DP', 'DY', 'SK', 'AY', 'LX', 'OS', 'LO', 'TP', 'A3',
  'EI', 'AZ', 'SN', 'LG', 'EW', 'EN', 'HV', 'TO', 'BJ', 'XQ', 'TOM', 'EZY', 'EJU',
]);

// Valid airport IATA codes (subset of major European + common destinations)
const AIRPORT_CODES = new Set([
  // UK & Ireland
  'LHR', 'LGW', 'STN', 'LTN', 'MAN', 'BHX', 'BRS', 'EDI', 'GLA', 'BFS', 'DUB', 'ORK', 'SNN',
  // Germany
  'FRA', 'MUC', 'BER', 'DUS', 'HAM', 'CGN', 'STR', 'HAJ', 'NUE', 'HHN', 'FMM',
  // Italy
  'FCO', 'MXP', 'LIN', 'BGY', 'VCE', 'NAP', 'BLQ', 'PSA', 'CTA', 'PMO', 'BRI', 'TRN',
  // Spain
  'MAD', 'BCN', 'PMI', 'AGP', 'ALC', 'VLC', 'SVQ', 'IBZ', 'TFS', 'LPA', 'ACE', 'FUE',
  // France
  'CDG', 'ORY', 'BVA', 'LYS', 'NCE', 'MRS', 'TLS', 'NTE', 'BOD',
  // Benelux
  'AMS', 'BRU', 'CRL', 'EIN', 'RTM', 'LUX',
  // Central Europe
  'VIE', 'ZRH', 'GVA', 'PRG', 'BUD', 'WAW', 'KRK', 'WRO', 'GDN', 'BTS',
  // Nordics & Baltics
  'CPH', 'ARN', 'GOT', 'OSL', 'BGO', 'HEL', 'RIX', 'TLL', 'VNO', 'KUN',
  // South Europe
  'ATH', 'SKG', 'HER', 'RHO', 'CFU', 'LIS', 'OPO', 'FAO', 'MLA',
  // Eastern Europe
  'SOF', 'OTP', 'BEG', 'ZAG', 'SPU', 'DBV', 'LJU', 'SJJ', 'TIV',
  // Turkey
  'IST', 'SAW', 'AYT', 'ADB', 'ESB', 'DLM', 'BJV',
  // Russia & CIS
  'SVO', 'DME', 'VKO', 'LED', 'AER', 'KZN', 'SVX', 'KRR', 'MSQ', 'KBP', 'IEV',
  // Middle East
  'DXB', 'AUH', 'DOH', 'TLV', 'AMM',
  // Asia (popular)
  'BKK', 'DMK', 'HKT', 'USM', 'CNX', 'SIN', 'KUL', 'HKG', 'NRT', 'ICN', 'PEK', 'PVG',
  // North Africa
  'RAK', 'CMN', 'AGA', 'TUN', 'CAI', 'HRG', 'SSH',
]);

// Airport to city name mapping (for display)
const AIRPORT_TO_CITY: Record<string, string> = {
  'LHR': 'London', 'LGW': 'London', 'STN': 'London', 'LTN': 'London',
  'FRA': 'Frankfurt', 'MUC': 'Munich', 'BER': 'Berlin', 'DUS': 'Dusseldorf', 'CGN': 'Cologne', 'HHN': 'Frankfurt-Hahn',
  'FCO': 'Rome', 'MXP': 'Milan', 'LIN': 'Milan', 'BGY': 'Bergamo', 'VCE': 'Venice', 'NAP': 'Naples',
  'MAD': 'Madrid', 'BCN': 'Barcelona', 'PMI': 'Palma', 'AGP': 'Malaga', 'ALC': 'Alicante', 'IBZ': 'Ibiza',
  'CDG': 'Paris', 'ORY': 'Paris', 'BVA': 'Paris', 'NCE': 'Nice', 'MRS': 'Marseille', 'LYS': 'Lyon',
  'AMS': 'Amsterdam', 'BRU': 'Brussels', 'CRL': 'Charleroi',
  'VIE': 'Vienna', 'ZRH': 'Zurich', 'PRG': 'Prague', 'BUD': 'Budapest', 'WAW': 'Warsaw', 'KRK': 'Krakow',
  'CPH': 'Copenhagen', 'ARN': 'Stockholm', 'OSL': 'Oslo', 'HEL': 'Helsinki',
  'RIX': 'Riga', 'TLL': 'Tallinn', 'VNO': 'Vilnius',
  'ATH': 'Athens', 'HER': 'Heraklion', 'RHO': 'Rhodes', 'LIS': 'Lisbon', 'OPO': 'Porto', 'FAO': 'Faro',
  'IST': 'Istanbul', 'SAW': 'Istanbul', 'AYT': 'Antalya', 'DLM': 'Dalaman',
  'SVO': 'Moscow', 'DME': 'Moscow', 'VKO': 'Moscow', 'LED': 'St. Petersburg',
  'DXB': 'Dubai', 'DOH': 'Doha', 'TLV': 'Tel Aviv',
  'BKK': 'Bangkok', 'DMK': 'Bangkok', 'HKT': 'Phuket', 'USM': 'Ko Samui', 'SIN': 'Singapore',
  'DUB': 'Dublin', 'MAN': 'Manchester', 'EDI': 'Edinburgh', 'MLA': 'Malta',
  'TFS': 'Tenerife', 'LPA': 'Gran Canaria', 'ACE': 'Lanzarote', 'RAK': 'Marrakech',
};

// City names for route detection
const CITY_NAMES = [
  // Major European cities
  'London', 'Paris', 'Berlin', 'Rome', 'Milan', 'Madrid', 'Barcelona', 'Amsterdam',
  'Frankfurt', 'Munich', 'Vienna', 'Prague', 'Budapest', 'Warsaw', 'Krakow',
  'Dublin', 'Brussels', 'Lisbon', 'Porto', 'Athens', 'Stockholm', 'Copenhagen',
  'Oslo', 'Helsinki', 'Riga', 'Tallinn', 'Vilnius', 'Zurich', 'Geneva',
  // Airports/regions
  'Stansted', 'Gatwick', 'Luton', 'Heathrow', 'Bergamo', 'Malpensa', 'Fiumicino',
  'Cologne', 'Dusseldorf', 'Hamburg', 'Malaga', 'Alicante', 'Valencia', 'Palma',
  'Nice', 'Marseille', 'Lyon', 'Charleroi', 'Eindhoven',
  // Turkey
  'Istanbul', 'Antalya', 'Bodrum', 'Dalaman',
  // Russia
  'Moscow', 'St. Petersburg', 'Sochi',
  // Asia
  'Bangkok', 'Phuket', 'Ko Samui', 'Singapore', 'Dubai',
  // Russian names
  'Милан', 'Рим', 'Париж', 'Лондон', 'Берлин', 'Барселона', 'Мадрид',
  'Стамбул', 'Москва', 'Санкт-Петербург', 'Бангкок', 'Ко Самуи', 'Пхукет',
].join('|');

// Regex patterns for fallback parsing
const PATTERNS = {
  // Booking reference: 6 alphanumeric chars
  bookingRef: [
    /(?:booking|confirmation|reservation|pnr|reference|locator|бронирован|номер\s*заказа)[:\s#]+([A-Z0-9]{6})\b/gi,
    /\b([A-Z][A-Z0-9]{5})\b(?=\s*(?:\||booking|confirmation))/gi,
    /Reservation[:\s]+([A-Z0-9]{6})/gi,  // Ryanair
  ],
  // Flight number: 2-3 letter airline code + 1-4 digit number
  flightNumber: /\b(EZY|EJU|[A-Z]{2})\s?(\d{1,4})\b/g,
  // IATA airport codes in context
  airportRoute: /\b([A-Z]{3})\s*(?:to|→|->|-|–)\s*([A-Z]{3})\b/gi,
  // Date formats
  date: [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,                    // 25/03/2024
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,                    // 2024-03-25
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi, // 25 March 2024
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\b/gi, // Wed, 04 Sep 24
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\b/gi, // 04 Sep 24
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)[.\s]+(\d{4})/gi, // Russian
  ],
};

const MONTH_TO_NUM: Record<string, string> = {
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06',
  'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
};

function parseWithRegex(text: string, emailDate: string): FlightData[] {
  const flights: FlightData[] = [];

  // 1. Find booking reference
  let bookingRef = '';
  for (const pattern of PATTERNS.bookingRef) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      bookingRef = match[1].toUpperCase();
      break;
    }
  }

  // 2. Find all flight numbers (deduplicate: keep only FIRST occurrence of each)
  const flightNumbers: Array<{code: string, num: string, pos: number}> = [];
  const seenFlightNumbers = new Set<string>();
  PATTERNS.flightNumber.lastIndex = 0;
  let match;
  while ((match = PATTERNS.flightNumber.exec(text)) !== null) {
    const airlineCode = match[1].toUpperCase();
    // Validate airline code
    if (AIRLINE_CODES.has(airlineCode) || AIRLINE_CODES.has(airlineCode.substring(0, 2))) {
      // Normalize flight number for deduplication
      const normalizedCode = (airlineCode === 'EZY' || airlineCode === 'EJU') ? 'U2' : airlineCode;
      const flightKey = `${normalizedCode}${match[2]}`;

      // Only keep first occurrence of each flight number
      if (!seenFlightNumbers.has(flightKey)) {
        seenFlightNumbers.add(flightKey);
        flightNumbers.push({
          code: airlineCode,
          num: match[2],
          pos: match.index,
        });
      }
    }
  }

  // 3. Find routes (IATA codes OR city names)
  const routes: Array<{from: string, to: string, pos: number}> = [];

  // 3a. Try IATA codes first
  PATTERNS.airportRoute.lastIndex = 0;
  while ((match = PATTERNS.airportRoute.exec(text)) !== null) {
    const from = match[1].toUpperCase();
    const to = match[2].toUpperCase();
    if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
      routes.push({ from, to, pos: match.index });
    }
  }

  // 3b. Try city names if no IATA routes found
  if (routes.length === 0) {
    // Pattern 1: Simple "City - City" or "City to City"
    const cityRoutePattern = new RegExp(`(${CITY_NAMES})\\s*(?:to|→|->|-|–|—)\\s*(${CITY_NAMES})`, 'gi');
    while ((match = cityRoutePattern.exec(text)) !== null) {
      routes.push({ from: match[1], to: match[2], pos: match.index });
    }

    // Pattern 2: Russian "из Города в Город"
    if (routes.length === 0) {
      const russianFromTo = new RegExp(`из\\s+(${CITY_NAMES})\\s+в\\s+(${CITY_NAMES})`, 'gi');
      while ((match = russianFromTo.exec(text)) !== null) {
        routes.push({ from: match[1], to: match[2], pos: match.index });
      }
    }

    // Pattern 3: "City (Airport) - City (Airport)" (Ryanair style)
    if (routes.length === 0) {
      const ryanairPattern = new RegExp(`(${CITY_NAMES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITY_NAMES})`, 'gi');
      while ((match = ryanairPattern.exec(text)) !== null) {
        routes.push({ from: match[1], to: match[2], pos: match.index });
      }
    }
  }

  // 4. Find dates
  const dates: Array<{date: string, pos: number}> = [];
  for (const pattern of PATTERNS.date) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      let dateStr = '';
      const m0 = match[0];

      try {
        // Parse different formats
        if (/^\d{4}/.test(m0) && match[1] && match[2] && match[3]) {
          // YYYY-MM-DD
          dateStr = `${match[3]}/${match[2]}/${match[1]}`;
        } else if (/[a-zа-я]/i.test(m0) && match[1] && match[2] && match[3]) {
          // Month name format (e.g., "Wed, 04 Sep 24" or "25 March 2024")
          const day = String(match[1]).padStart(2, '0');
          const monthStr = String(match[2]).toLowerCase();
          const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
          // Handle 2-digit year: 24 -> 2024
          let year = String(match[3]);
          if (year.length === 2) {
            year = '20' + year;
          }
          dateStr = `${day}/${month}/${year}`;
        } else if (m0) {
          // DD/MM/YYYY - use as-is
          dateStr = m0;
        }

        if (dateStr) {
          dates.push({ date: dateStr, pos: match.index });
        }
      } catch {
        // Skip if parsing fails
      }
    }
  }

  // 5. Match flight numbers with routes and dates using context window
  for (const fn of flightNumbers) {
    // Create context window around flight number (500 chars each direction - smaller is more accurate)
    const contextStart = Math.max(0, fn.pos - 500);
    const contextEnd = Math.min(text.length, fn.pos + 500);
    const context = text.substring(contextStart, contextEnd);
    const fnPosInContext = fn.pos - contextStart; // Position of flight number in context

    // Helper: find closest match to flight number position
    function findClosestRouteMatch(pattern: RegExp, validator?: (m: RegExpExecArray) => boolean): {from: string, to: string} | null {
      pattern.lastIndex = 0;
      let m;
      let closestMatch: {from: string, to: string, dist: number} | null = null;
      while ((m = pattern.exec(context)) !== null) {
        if (validator && !validator(m)) continue;
        const dist = Math.abs(m.index - fnPosInContext);
        if (!closestMatch || dist < closestMatch.dist) {
          closestMatch = { from: m[1], to: m[2], dist };
        }
      }
      return closestMatch ? { from: closestMatch.from, to: closestMatch.to } : null;
    }

    // Find route in context - prioritize closest match to flight number
    let flightRoute: {from: string, to: string} | null = null;

    // Try IATA codes in context (find closest)
    const iataPattern = /\b([A-Z]{3})\s*(?:to|→|->|-|–|—)\s*([A-Z]{3})\b/gi;
    flightRoute = findClosestRouteMatch(iataPattern, (m) =>
      AIRPORT_CODES.has(m[1].toUpperCase()) && AIRPORT_CODES.has(m[2].toUpperCase())
    );
    if (flightRoute) {
      flightRoute = { from: flightRoute.from.toUpperCase(), to: flightRoute.to.toUpperCase() };
    }

    // Try city names in context (find closest) - multiple patterns
    if (!flightRoute) {
      // Pattern 1: "City - City" or "City to City" or "City → City"
      const cityPattern = new RegExp(`(${CITY_NAMES})\\s*(?:to|→|->|-|–|—)\\s*(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(cityPattern);
    }

    // Pattern 2: Russian "из Города в Город" format
    if (!flightRoute) {
      const russianFromTo = new RegExp(`из\\s+(${CITY_NAMES})\\s+в\\s+(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(russianFromTo);
    }

    // Pattern 3: Ryanair format "City (Airport) - City (Airport)"
    if (!flightRoute) {
      const ryanairPattern = new RegExp(`(${CITY_NAMES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(ryanairPattern);
    }

    // Fallback: use closest route from full email
    if (!flightRoute && routes.length > 0) {
      let closestRoute = routes[0];
      let minDist = Infinity;
      for (const route of routes) {
        const dist = Math.abs(route.pos - fn.pos);
        if (dist < minDist) {
          minDist = dist;
          closestRoute = route;
        }
      }
      flightRoute = { from: closestRoute.from, to: closestRoute.to };
    }

    // Find closest date to flight number in context
    let flightDate = '';
    let closestDateDist = Infinity;

    for (const pattern of PATTERNS.date) {
      pattern.lastIndex = 0;
      let dateMatch;
      while ((dateMatch = pattern.exec(context)) !== null) {
        if (!dateMatch[0]) continue;

        const dist = Math.abs(dateMatch.index - fnPosInContext);
        if (dist >= closestDateDist) continue;

        const m0 = dateMatch[0];
        let parsedDate = '';
        try {
          if (/^\d{4}/.test(m0) && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            // YYYY-MM-DD format
            parsedDate = `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
          } else if (/[a-zа-я]/i.test(m0) && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            // DD Month YY or DD Month YYYY format (e.g., "Wed, 04 Sep 24" or "25 March 2024")
            const day = String(dateMatch[1]).padStart(2, '0');
            const monthStr = String(dateMatch[2]).toLowerCase();
            const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
            // Handle 2-digit year: 24 -> 2024
            let year = String(dateMatch[3]);
            if (year.length === 2) {
              year = '20' + year;
            }
            parsedDate = `${day}/${month}/${year}`;
          } else if (/^\d{1,2}[\/\-\.]/.test(m0)) {
            // DD/MM/YYYY format - use as-is
            parsedDate = m0;
          }
        } catch {
          // Skip if parsing fails
        }

        if (parsedDate) {
          flightDate = parsedDate;
          closestDateDist = dist;
        }
      }
    }

    // Fallback: use closest date from full email
    if (!flightDate && dates.length > 0) {
      let closestDate = dates[0];
      let minDist = Infinity;
      for (const date of dates) {
        const dist = Math.abs(date.pos - fn.pos);
        if (dist < minDist) {
          minDist = dist;
          closestDate = date;
        }
      }
      flightDate = closestDate.date;
    }

    // Calculate confidence
    let confidence = 30; // Base: found flight number
    if (bookingRef) confidence += 25;
    if (flightRoute) confidence += 25;
    if (flightDate) confidence += 20;

    // Normalize flight number (EZY/EJU -> U2)
    let flightNumber = `${fn.code}${fn.num}`;
    if (fn.code === 'EZY' || fn.code === 'EJU') {
      flightNumber = `U2${fn.num}`;
    }

    flights.push({
      flightNumber,
      airline: fn.code.substring(0, 2),
      from: flightRoute?.from || '',
      to: flightRoute?.to || '',
      departureTime: flightDate || '',
      bookingRef,
      confidence,
    });
  }

  return flights;
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================

interface FlightInfo {
  id: string;
  flightNumber: string;
  date: string;
  route: string;
  bookingRef: string;
  subject: string;
  from: string;
  snippet: string;
  receivedAt: string;
  confidence: number;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated or no Gmail access' },
        { status: 401 }
      );
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // LEVEL 1: Filter emails
    const query = buildGmailQuery(3);
    console.log('Gmail query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
    });

    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} potential flight emails`);

    // Process emails
    const flightMap = new Map<string, FlightInfo>();

    for (const msg of messages.slice(0, 50)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const fromHeader = headers.find(h => h.name === 'From')?.value || '';
        const dateHeader = headers.find(h => h.name === 'Date')?.value || '';
        const snippet = detail.data.snippet || '';

        const bodyHtml = extractBodyHtml(detail.data.payload);
        const bodyText = extractBodyText(detail.data.payload);

        // LEVEL 2: Try JSON-LD first
        let parsedFlights = parseJsonLD(bodyHtml);
        const hasJsonLD = parsedFlights.length > 0;

        // LEVEL 3: Regex fallback
        if (parsedFlights.length === 0) {
          const textToSearch = `${subject} ${snippet} ${bodyText}`;
          parsedFlights = parseWithRegex(textToSearch, dateHeader);
        }

        // Debug: log all found flights before filtering
        if (parsedFlights.length > 0) {
          console.log(`\n━━━ Email: ${subject.substring(0, 50)}... ━━━`);
          console.log(`From: ${fromHeader.substring(0, 40)}`);
          console.log(`JSON-LD: ${hasJsonLD ? 'YES' : 'NO'}`);
          console.log(`Flights found: ${parsedFlights.length}`);
          for (const f of parsedFlights) {
            const status = f.confidence >= 30 ? '✓' : '❌';
            console.log(`  ${status} ${f.flightNumber}: ${f.from}→${f.to}, ${f.departureTime}, conf=${f.confidence}, ref=${f.bookingRef || '-'}`);
          }
        }

        // Store flights with confidence >= 30 (lowered for debugging)
        for (const flight of parsedFlights) {
          if (flight.confidence < 30) continue;

          // Use flightNumber + date as key to allow same flight on different dates (return flights)
          const key = flight.departureTime
            ? `${flight.flightNumber}_${flight.departureTime}`
            : flight.flightNumber;
          const existing = flightMap.get(key);

          // Keep the one with higher confidence or more complete data
          if (!existing || flight.confidence > existing.confidence) {
            const fromCity = AIRPORT_TO_CITY[flight.from] || flight.from;
            const toCity = AIRPORT_TO_CITY[flight.to] || flight.to;

            flightMap.set(key, {
              id: msg.id!,
              flightNumber: flight.flightNumber,
              date: flight.departureTime || 'Check email',
              route: fromCity && toCity ? `${fromCity} → ${toCity}` : 'Check email',
              bookingRef: flight.bookingRef || '-',
              subject: subject.substring(0, 80),
              from: extractEmailDomain(fromHeader),
              snippet: snippet.substring(0, 100),
              receivedAt: dateHeader,
              confidence: flight.confidence,
            });

            console.log(`Flight ${flight.flightNumber}: ${fromCity}→${toCity}, ${flight.departureTime}, conf=${flight.confidence}`);
          }
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    }

    const flights = Array.from(flightMap.values());

    // Sort by confidence (highest first)
    flights.sort((a, b) => b.confidence - a.confidence);

    return NextResponse.json({
      success: true,
      totalFound: messages.length,
      flights,
    });

  } catch (error: any) {
    console.error('Gmail API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to scan Gmail' },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function extractBodyHtml(payload: any): string {
  if (!payload) return '';

  let html = '';

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    html += decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        html += decodeBase64(part.body.data);
      } else if (part.parts) {
        html += extractBodyHtml(part);
      }
    }
  }

  return html;
}

function extractBodyText(payload: any): string {
  if (!payload) return '';

  let text = '';

  if (payload.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    text += payload.mimeType === 'text/html'
      ? decoded.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
      : decoded;
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text += decodeBase64(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64(part.body.data);
        text += html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
      } else if (part.parts) {
        text += extractBodyText(part);
      }
    }
  }

  return text;
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractEmailDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : from;
}
