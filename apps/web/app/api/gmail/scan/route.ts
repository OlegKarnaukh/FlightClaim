import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';

// ============================================================================
// LEVEL 1: GMAIL API FILTER
// ============================================================================

const AIRLINE_DOMAINS = [
  'ryanair.com', 'ryanairmail.com', 'rfrmail.com', // Ryanair uses multiple domains
  'easyjet.com', 'mail.easyjet.com', 'info.easyjet.com', // EasyJet sends from info.easyjet.com
  'lufthansa.com', 'wizzair.com', 'vueling.com',
  'airbaltic.com', 'klm.com', 'airfrance.com', 'britishairways.com', 'iberia.com',
  'turkishairlines.com', 'emirates.com', 'qatarairways.com',
  'flypgs.com', 'mailing.flypgs.com', 'noreply.flypgs.com', // Pegasus Airlines
  'bangkokair.com', 'aeroflot.ru', 's7.ru', 'norwegian.com',
];

const OTA_DOMAINS = [
  'trip.com', 'booking.com', 'expedia.com', 'skyscanner.com', 'kayak.com', 'kiwi.com',
  'yandex.ru', 'travel.yandex.ru', 'yandex.com', // Yandex Travel
];

// Content patterns for forwarded emails
const CONTENT_PATTERNS = [
  '"Ryanair DAC"', '"ryanairmail.com"', '"Ryanair Travel"',
  '"easyJet"', '"easyjet.com"', '"EZY"', '"EJU"', '"time to fly"',
  '"Trip.com"', '"Бронирование авиабилета"', '"электронные билеты"',
  '"flight confirmation"', '"booking reference"', '"e-ticket"', '"online ticket"',
  '"Pegasus"', '"flypgs"', '"Pegasus Airlines"', '"Online Ticket Reservation"',
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
  confidenceDetails?: {
    flightNumber: number;
    bookingRef: number;
    departureAirport: number;
    arrivalAirport: number;
    date: number;
    passengerName: number;
    knownDomain: number;
  };
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

// Valid airline IATA codes (2 letters or 3-letter codes like EZY)
const AIRLINE_CODES = new Set([
  'FR', 'U2', 'LH', 'W6', 'VY', 'BT', 'KL', 'AF', 'BA', 'IB', 'TK', 'EK', 'QR',
  'PC', 'PG', 'SU', 'S7', 'U6', 'DP', 'DY', 'SK', 'AY', 'LX', 'OS', 'LO', 'TP', 'A3',
  'EI', 'AZ', 'SN', 'LG', 'EW', 'EN', 'HV', 'TO', 'BJ', 'XQ', 'TOM', 'EZY', 'EJU',
  // Additional airlines
  'UA', 'I2', 'FZ', 'FY', // United, Iberia Express, flydubai, Kiwi
  // Airlines for tests 21-30
  'NH', 'DL', 'CA', 'WN', 'DY', 'KE', 'B6', 'A3', // ANA, Delta, Air China, Southwest, Norwegian, Korean Air, JetBlue, Aegean
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
  // North America (for long-haul from EU)
  'SFO', 'LAX', 'ORD', 'EWR', 'JFK', 'IAD', 'BOS', 'MIA', 'YYZ', 'YVR',
  'ATL', 'LAS', 'PHX', 'FLL', // Atlanta, Las Vegas, Phoenix, Fort Lauderdale
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
  'Moscow', 'St. Petersburg', 'St.Petersburg', 'Sochi',
  // Asia
  'Bangkok', 'Phuket', 'Ko Samui', 'Singapore', 'Dubai', 'Almaty',
  // Pegasus airport names (will be normalized to city)
  'Milan-Bergamo', 'Istanbul Sabiha Gokcen',
  // Russian names
  'Милан', 'Рим', 'Париж', 'Лондон', 'Берлин', 'Барселона', 'Мадрид',
  'Стамбул', 'Москва', 'Санкт-Петербург', 'Бангкок', 'Ко Самуи', 'Пхукет', 'Алматы',
].join('|');

// Normalize airport names to city names
function normalizeCity(name: string): string {
  const normalized = name.trim();
  const lower = normalized.toLowerCase();
  if (lower === 'milan-bergamo' || lower === 'milan bergamo' || lower === 'bergamo') return 'Milan';
  if (lower.includes('istanbul') || lower === 'sabiha gokcen') return 'Istanbul';
  if (lower === 'st.petersburg' || lower === 'st. petersburg') return 'St. Petersburg';
  if (lower === 'stansted' || lower === 'gatwick' || lower === 'luton' || lower === 'heathrow') return 'London';
  if (lower === 'malpensa' || lower === 'fiumicino') return 'Rome';
  return normalized;
}

// False routes - airport names that look like city pairs (e.g., "Milan Bergamo" is BGY airport)
const FALSE_ROUTES = new Set([
  'milan-bergamo', 'milano-bergamo', 'milan bergamo', 'milano bergamo',
  'london-stansted', 'london-luton', 'london-gatwick', 'london-heathrow',
  'frankfurt-hahn', 'paris-beauvais', 'paris-orly', 'new york-jfk',
  // Pegasus airport names
  'istanbul-sabiha', 'istanbul sabiha', 'sabiha-gokcen', 'sabiha gokcen',
]);

function isFalseRoute(from: string, to: string): boolean {
  const key1 = `${from.toLowerCase()}-${to.toLowerCase()}`;
  const key2 = `${from.toLowerCase()} ${to.toLowerCase()}`;
  return FALSE_ROUTES.has(key1) || FALSE_ROUTES.has(key2);
}

// Regex patterns for fallback parsing
const PATTERNS = {
  // Booking reference: 6-7 alphanumeric chars with context
  bookingRef: [
    /(?:booking|confirmation|reservation|pnr|reference|locator|бронирован|номер\s*заказа|код\s*бронирования|booking\s*code)[:\s#]+([A-Z0-9]{6,7})\b/gi,
    /(?:Confirmation\s+Code)[:\s]*([A-Z0-9]{5,7})\b/gi, // Expedia format: "Confirmation Code: UA5K7M"
    /(?:PIN-код|PIN)[:\s]*(\d{4,6})\b/gi, // Yandex format: "PIN-код: 5200"
    // Pegasus format: "Reservation (PNR) No E29QDR" or "Номер подтверждения E29QDR"
    /(?:Reservation\s*\(PNR\)\s*No|Номер\s*подтверждения)[:\s]*([A-Z0-9]{6})\b/gi,
    /(?:BOOKING\s*CODE|КОД\s*БРОНИРОВАНИЯ)[\s\S]{0,30}?([A-Z]{2}[A-Z0-9]{4})\b/gi,
    // Mixed alphanumeric refs MUST have letter after digits (to exclude flight numbers like PC1212)
    /\b([A-Z]{2}[0-9][A-Z][A-Z0-9]{2})\b/g, // Like PC8M4N - has letter after digit
    /\b([A-Z][0-9][A-Z][A-Z0-9]{3,4})\b/g, // Like K7G7F5N - letter after first digit
    /Reservation[:\s]+([A-Z0-9]{6})/gi,  // Ryanair
  ],
  // Flight number: 2-3 letter airline code (may include digit like U2, W6, S7) + optional space + 1-4 digit number
  flightNumber: /\b(EZY|EJU|[A-Z][A-Z0-9])\s*(\d{1,4})\b/g,
  // IATA airport codes in context
  airportRoute: /\b([A-Z]{3})\s*(?:to|→|->|-|–)\s*([A-Z]{3})\b/gi,
  // Date formats
  date: [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,                    // 25/03/2024
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,                    // 2024-03-25
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi, // 25 March 2024
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi, // US: September 10, 2026
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\b/gi, // Wed, 04 Sep 24 OR Wed 04 Sep 2024
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})\b/gi, // 04 Sep 24 OR 04 Sep 2024
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi, // Sun 09 Jun (no year - will infer)
    /(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+(\d{4})/gi, // Russian: 17 нояб. 2024 or 17 ноября 2024
    // Italian: "22 settembre 2026"
    /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/gi,
    // Spanish: "12 de noviembre de 2026"
    /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de)?\s+(\d{4})/gi,
    // Polish: "18 grudnia 2026"
    /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(\d{4})/gi,
    // Japanese: "2027年3月5日"
    /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
    // Korean: "2027년 9월 25일"
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
    // Greek: "15 Ιουλίου 2027"
    /(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s+(\d{4})/gi,
  ],
  // Passenger name patterns
  passengerName: [
    /(?:passenger|pasajero|пассажир|passager|nome|name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /([A-Z]{2,}\/[A-Z]{2,}(?:\s+(?:MR|MS|MRS|MISS))?)/g, // LASTNAME/FIRSTNAME MR
    /(?:Dear|Уважаемый|Уважаемая)\s+(?:Mr\.?|Ms\.?|Mrs\.?|Miss)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  ],
};

const MONTH_TO_NUM: Record<string, string> = {
  // English
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  'january': '01', 'february': '02', 'march': '03', 'april': '04', 'june': '06',
  'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12',
  // Russian full names
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06',
  'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
  // Russian abbreviations (янв., фев., нояб., etc.)
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'май': '05', 'июн': '06',
  'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
  'нояб': '11', 'сент': '09', // longer abbreviations
  // Italian
  'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04', 'maggio': '05', 'giugno': '06',
  'luglio': '07', 'agosto': '08', 'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12',
  // Spanish
  'enero': '01', 'febrero': '02', 'abril': '04', 'mayo': '05', 'junio': '06',
  'julio': '07', 'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12',
  // Polish
  'stycznia': '01', 'lutego': '02', 'marca': '03', 'kwietnia': '04', 'maja': '05', 'czerwca': '06',
  'lipca': '07', 'sierpnia': '08', 'września': '09', 'października': '10', 'listopada': '11', 'grudnia': '12',
  // Greek
  'ιανουαρίου': '01', 'φεβρουαρίου': '02', 'μαρτίου': '03', 'απριλίου': '04', 'μαΐου': '05', 'ιουνίου': '06',
  'ιουλίου': '07', 'αυγούστου': '08', 'σεπτεμβρίου': '09', 'οκτωβρίου': '10', 'νοεμβρίου': '11', 'δεκεμβρίου': '12',
};

function parseWithRegex(text: string, emailDate: string, emailFrom: string = ''): FlightData[] {
  const flights: FlightData[] = [];

  // Helper: extract year from email date header for dates without year
  function getYearFromEmailDate(): string {
    if (!emailDate) return new Date().getFullYear().toString();
    const yearMatch = emailDate.match(/\b(20\d{2})\b/);
    return yearMatch ? yearMatch[1] : new Date().getFullYear().toString();
  }
  const inferredYear = getYearFromEmailDate();

  // 1. Find booking reference
  let bookingRef = '';
  // Words that look like booking refs but aren't
  const invalidBookingRefs = new Set(['NUMBER', 'TICKET', 'FLIGHT', 'BOOKING', 'RESERV', 'CONFIR', 'DETAIL', 'ONLINE', 'ITINER']);
  for (const pattern of PATTERNS.bookingRef) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const candidate = match[1].toUpperCase();
      // Skip if it's a common English word or doesn't contain at least one digit (for 6-7 char refs)
      if (invalidBookingRefs.has(candidate) || invalidBookingRefs.has(candidate.substring(0, 6))) {
        continue;
      }
      bookingRef = candidate;
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

  // 3b. Try city names - find ALL routes (not just if no IATA)
  // Map to store routes by date for Trip.com style matching
  const routesByDate: Map<string, {from: string, to: string}> = new Map();

  // Pattern 1: Trip.com format "City - City • date" - extract with date association
  const tripComPattern = new RegExp(`(${CITY_NAMES})\\s*[-–—]\\s*(${CITY_NAMES})\\s*[•·]\\s*(\\d{1,2})\\s*(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)[а-я]*`, 'gi');
  while ((match = tripComPattern.exec(text)) !== null) {
    routes.push({ from: match[1], to: match[2], pos: match.index });
    // Store route by date (e.g., "17/11" for "17 нояб")
    const day = String(match[3]).padStart(2, '0');
    const monthStr = match[4].toLowerCase();
    const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '';
    if (month) {
      const dateKey = `${day}/${month}`;
      routesByDate.set(dateKey, { from: match[1], to: match[2] });
    }
  }

  // Pattern 2: Simple "City - City" or "City to City"
  if (routes.length === 0) {
    const cityRoutePattern = new RegExp(`(${CITY_NAMES})\\s*(?:to|→|->|-|–|—)\\s*(${CITY_NAMES})`, 'gi');
    while ((match = cityRoutePattern.exec(text)) !== null) {
      // Skip if this is an airport name, not a route
      if (isFalseRoute(match[1], match[2])) continue;
      routes.push({ from: match[1], to: match[2], pos: match.index });
    }
  }

  // Pattern 3: Russian "из Города в Город"
  if (routes.length === 0) {
    const russianFromTo = new RegExp(`из\\s+(${CITY_NAMES})\\s+в\\s+(${CITY_NAMES})`, 'gi');
    while ((match = russianFromTo.exec(text)) !== null) {
      routes.push({ from: match[1], to: match[2], pos: match.index });
    }
  }

  // Pattern 4: "City (Airport) - City (Airport)" (Ryanair style)
  if (routes.length === 0) {
    const ryanairPattern = new RegExp(`(${CITY_NAMES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITY_NAMES})`, 'gi');
    while ((match = ryanairPattern.exec(text)) !== null) {
      routes.push({ from: match[1], to: match[2], pos: match.index });
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
        // Japanese/Korean: 2027年3月5日 or 2027년 9월 25일
        if (/年|년/.test(m0) && match[1] && match[2] && match[3]) {
          const year = match[1];
          const month = String(match[2]).padStart(2, '0');
          const day = String(match[3]).padStart(2, '0');
          dateStr = `${day}/${month}/${year}`;
        } else if (/^\d{4}/.test(m0) && match[1] && match[2] && match[3]) {
          // YYYY-MM-DD
          dateStr = `${match[3]}/${match[2]}/${match[1]}`;
        } else if (/[a-zа-яęΑ-Ωα-ω]/i.test(m0) && match[1] && match[2]) {
          // Month name format - detect if month comes first (US format: "September 10, 2026")
          // First, strip weekday prefix like "Sun", "Mon" etc. before checking
          const dateWithoutWeekday = m0.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]*/i, '').trim();
          const isMonthFirst = /^[a-zа-яęΑ-Ωα-ω]/i.test(dateWithoutWeekday);
          let day: string, monthStr: string, year: string;

          if (isMonthFirst) {
            // US format: Month DD, YYYY
            monthStr = String(match[1]).toLowerCase();
            day = String(match[2]).padStart(2, '0');
            year = match[3] ? String(match[3]) : inferredYear;
          } else {
            // European format: DD Month YYYY
            day = String(match[1]).padStart(2, '0');
            monthStr = String(match[2]).toLowerCase();
            year = match[3] ? String(match[3]) : inferredYear;
          }

          const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
          // Handle 2-digit year
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

    // FIRST: Find closest date to flight number in context
    let flightDate = '';
    let closestDateDist = Infinity;
    let flightDateKey = ''; // For Trip.com route matching by date

    for (const pattern of PATTERNS.date) {
      pattern.lastIndex = 0;
      let dateMatch;
      while ((dateMatch = pattern.exec(context)) !== null) {
        if (!dateMatch[0]) continue;

        const dist = Math.abs(dateMatch.index - fnPosInContext);
        if (dist >= closestDateDist) continue;

        const m0 = dateMatch[0];
        let parsedDate = '';
        let dayMonth = '';
        try {
          // Japanese/Korean: 2027年3月5日 or 2027년 9월 25일
          if (/年|년/.test(m0) && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            const year = dateMatch[1];
            const month = String(dateMatch[2]).padStart(2, '0');
            const day = String(dateMatch[3]).padStart(2, '0');
            parsedDate = `${day}/${month}/${year}`;
            dayMonth = `${day}/${month}`;
          } else if (/^\d{4}/.test(m0) && dateMatch[1] && dateMatch[2] && dateMatch[3]) {
            parsedDate = `${dateMatch[3]}/${dateMatch[2]}/${dateMatch[1]}`;
            dayMonth = `${String(dateMatch[3]).padStart(2, '0')}/${dateMatch[2]}`;
          } else if (/[a-zа-яęΑ-Ωα-ω]/i.test(m0) && dateMatch[1] && dateMatch[2]) {
            // Month name format - detect if month comes first (US format)
            // First, strip weekday prefix like "Sun", "Mon" etc. before checking
            const dateWithoutWeekday = m0.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]*/i, '').trim();
            const isMonthFirst = /^[a-zа-яęΑ-Ωα-ω]/i.test(dateWithoutWeekday);
            let day: string, monthStr: string, year: string;

            if (isMonthFirst) {
              // US format: Month DD, YYYY
              monthStr = String(dateMatch[1]).toLowerCase();
              day = String(dateMatch[2]).padStart(2, '0');
              year = dateMatch[3] ? String(dateMatch[3]) : inferredYear;
            } else {
              // European format: DD Month YYYY
              day = String(dateMatch[1]).padStart(2, '0');
              monthStr = String(dateMatch[2]).toLowerCase();
              year = dateMatch[3] ? String(dateMatch[3]) : inferredYear;
            }

            const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
            if (year.length === 2) year = '20' + year;
            parsedDate = `${day}/${month}/${year}`;
            dayMonth = `${day}/${month}`;
          } else if (/^\d{1,2}[\/\-\.]/.test(m0)) {
            parsedDate = m0;
            const parts = m0.split(/[\/\-\.]/);
            if (parts.length >= 2) {
              dayMonth = `${String(parts[0]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}`;
            }
          }
        } catch {
          // Skip if parsing fails
        }

        if (parsedDate) {
          flightDate = parsedDate;
          flightDateKey = dayMonth;
          closestDateDist = dist;
        }
      }
    }

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

    // SECOND: Find route - FIRST try matching by date (for Trip.com), then by position
    let flightRoute: {from: string, to: string} | null = null;

    // Trip.com: Match route by date if available
    if (flightDateKey && routesByDate.has(flightDateKey)) {
      flightRoute = routesByDate.get(flightDateKey)!;
    }

    // Try IATA codes in context (find closest)
    if (!flightRoute) {
      const iataPattern = /\b([A-Z]{3})\s*(?:to|→|->|-|–|—)\s*([A-Z]{3})\b/gi;
      flightRoute = findClosestRouteMatch(iataPattern, (m) =>
        AIRPORT_CODES.has(m[1].toUpperCase()) && AIRPORT_CODES.has(m[2].toUpperCase())
      );
      if (flightRoute) {
        flightRoute = { from: flightRoute.from.toUpperCase(), to: flightRoute.to.toUpperCase() };
      }
    }

    // Try city names in context (find closest) - multiple patterns
    if (!flightRoute) {
      const cityPattern = new RegExp(`(${CITY_NAMES})\\s*(?:to|→|->|-|–|—)\\s*(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(cityPattern, (m) => !isFalseRoute(m[1], m[2]));
    }

    // Russian "из Города в Город" format
    if (!flightRoute) {
      const russianFromTo = new RegExp(`из\\s+(${CITY_NAMES})\\s+в\\s+(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(russianFromTo);
    }

    // Ryanair format "City (Airport) - City (Airport)"
    if (!flightRoute) {
      const ryanairPattern = new RegExp(`(${CITY_NAMES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITY_NAMES})`, 'gi');
      flightRoute = findClosestRouteMatch(ryanairPattern);
    }

    // Pegasus format "Откуда / From: City (MXP)" and "Куда / To: City (SAW)"
    if (!flightRoute) {
      const pegasusFromPattern = /(?:Откуда|From)[:\s/]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const pegasusToPattern = /(?:Куда|To)[:\s/]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const fromMatch = pegasusFromPattern.exec(context);
      const toMatch = pegasusToPattern.exec(context);
      if (fromMatch && toMatch) {
        const from = fromMatch[1].toUpperCase();
        const to = toMatch[1].toUpperCase();
        if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
          flightRoute = { from, to };
        }
      }
    }

    // Expedia format "Departure Airport: City (CODE)...Arrival Airport: City (CODE)"
    if (!flightRoute) {
      const depAirportPattern = /Departure\s+Airport[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const arrAirportPattern = /Arrival\s+Airport[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const depMatch = depAirportPattern.exec(context);
      const arrMatch = arrAirportPattern.exec(context);
      if (depMatch && arrMatch) {
        const from = depMatch[1].toUpperCase();
        const to = arrMatch[1].toUpperCase();
        if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
          flightRoute = { from, to };
        }
      }
    }

    // Spanish format "Salida Aeropuerto: City (CODE)...Llegada Aeropuerto: City (CODE)"
    if (!flightRoute) {
      const salidaPattern = /Salida\s+(?:Aeropuerto)?[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const llegadaPattern = /Llegada\s+(?:Aeropuerto)?[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
      const salidaMatch = salidaPattern.exec(context);
      const llegadaMatch = llegadaPattern.exec(context);
      if (salidaMatch && llegadaMatch) {
        const from = salidaMatch[1].toUpperCase();
        const to = llegadaMatch[1].toUpperCase();
        if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
          flightRoute = { from, to };
        }
      }
    }

    // EasyJet format: "Depart ... City ... Arrive ... City" or "City–City" in subject
    if (!flightRoute) {
      // Try subject format first: "Milan–Barcelona" or "Milan-Barcelona"
      const subjectRoutePattern = new RegExp(`(${CITY_NAMES})[–\\-](${CITY_NAMES})`, 'gi');
      const subjectMatch = subjectRoutePattern.exec(context);
      if (subjectMatch && !isFalseRoute(subjectMatch[1], subjectMatch[2])) {
        flightRoute = { from: normalizeCity(subjectMatch[1]), to: normalizeCity(subjectMatch[2]) };
      }
    }

    // Pegasus format "Milan-Bergamo		Istanbul Sabiha Gokcen" (tabs/spaces between locations)
    if (!flightRoute) {
      // Match: CityName(-AirportName)?  whitespace{2+}  CityName( AirportName)?
      const pegasusRoutePattern = /([A-Za-z][A-Za-z.\-]+(?:\s+[A-Za-z]+)*)\s{2,}([A-Za-z][A-Za-z.\-]+(?:\s+[A-Za-z]+)*)/gi;
      const pegasusMatch = pegasusRoutePattern.exec(context);
      if (pegasusMatch) {
        const from = normalizeCity(pegasusMatch[1]);
        const to = normalizeCity(pegasusMatch[2]);
        if (from !== to && !isFalseRoute(from, to)) {
          flightRoute = { from, to };
        }
      }
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

    // Fallback: use closest date from full email if not found in context
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

    // Extract passenger name from context
    let passengerName = '';
    for (const pattern of PATTERNS.passengerName) {
      pattern.lastIndex = 0;
      const nameMatch = pattern.exec(context);
      if (nameMatch && nameMatch[1]) {
        const name = nameMatch[1].trim();
        // Filter out invalid names (too short, contains numbers)
        if (name.length > 3 && !/\d/.test(name)) {
          passengerName = name;
          break;
        }
      }
    }

    // Calculate detailed confidence score (Genspark-style)
    const confidenceDetails = {
      flightNumber: 15, // Base: found valid flight number
      bookingRef: bookingRef ? 20 : 0,
      departureAirport: (flightRoute?.from && AIRPORT_CODES.has(flightRoute.from.toUpperCase())) ? 10 : (flightRoute?.from ? 5 : 0),
      arrivalAirport: (flightRoute?.to && AIRPORT_CODES.has(flightRoute.to.toUpperCase())) ? 10 : (flightRoute?.to ? 5 : 0),
      date: flightDate ? 15 : 0,
      passengerName: passengerName ? 5 : 0,
      knownDomain: AIRLINE_DOMAINS.some(d => emailFrom.toLowerCase().includes(d)) ? 10 : 0,
    };

    const confidence = Object.values(confidenceDetails).reduce((a, b) => a + b, 0);

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
      passengerName: passengerName || undefined,
      confidence,
      confidenceDetails,
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

    for (const msg of messages.slice(0, 100)) {
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
          parsedFlights = parseWithRegex(textToSearch, dateHeader, fromHeader);
        }

        // Debug: log all found flights before filtering
        const isEasyJetEmail = fromHeader.toLowerCase().includes('easyjet') ||
                               subject.toLowerCase().includes('easyjet') ||
                               subject.toLowerCase().includes('time to fly');

        if (parsedFlights.length > 0 || isEasyJetEmail) {
          console.log(`\n━━━ Email: ${subject.substring(0, 50)}... ━━━`);
          console.log(`From: ${fromHeader.substring(0, 50)}`);
          console.log(`Date: ${dateHeader}`);
          console.log(`JSON-LD: ${hasJsonLD ? 'YES' : 'NO'}`);
          console.log(`Flights found: ${parsedFlights.length}`);
          if (isEasyJetEmail && parsedFlights.length === 0) {
            console.log(`[DEBUG] EasyJet email but no flights detected!`);
            console.log(`[DEBUG] Snippet: ${snippet.substring(0, 200)}`);
            console.log(`[DEBUG] Body preview: ${bodyText.substring(0, 500)}`);
          }
          for (const f of parsedFlights) {
            const status = f.confidence >= 30 ? '✓' : '❌';
            console.log(`  ${status} ${f.flightNumber}: ${f.from}→${f.to}, ${f.departureTime}, conf=${f.confidence}, ref=${f.bookingRef || '-'}`);
          }
        }

        // Store flights with confidence >= 30 (lowered for debugging)
        for (const flight of parsedFlights) {
          if (flight.confidence < 30) continue;

          // Normalize date for deduplication (convert various formats to YYYY-MM-DD)
          let normalizedDate = '';
          if (flight.departureTime) {
            // Handle formats: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY, Mon/DD/YYYY, Mon DD, YYYY
            const monthMap: Record<string, string> = {
              Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
              Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
            };
            const dateStr = flight.departureTime;
            // Try numeric format: DD/MM/YYYY or DD.MM.YYYY
            const numericMatch = dateStr.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
            if (numericMatch) {
              normalizedDate = `${numericMatch[3]}-${numericMatch[2].padStart(2, '0')}-${numericMatch[1].padStart(2, '0')}`;
            } else {
              // Try Mon/DD/YYYY or Mon DD, YYYY format
              const monthMatch = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\/\s]+(\d{1,2})[,\/\s]+(\d{4})/i);
              if (monthMatch) {
                const month = monthMap[monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase()] || '01';
                normalizedDate = `${monthMatch[3]}-${month}-${monthMatch[2].padStart(2, '0')}`;
              } else {
                normalizedDate = dateStr; // Fallback to original
              }
            }
          }
          // Use flightNumber + normalized date as key to allow same flight on different dates (return flights)
          const key = normalizedDate
            ? `${flight.flightNumber}_${normalizedDate}`
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
