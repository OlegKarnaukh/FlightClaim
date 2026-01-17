import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';

// Airlines we're looking for - search by sender AND by content (for forwarded emails)
const AIRLINE_FROM_QUERIES = [
  'from:ryanair.com',
  'from:easyjet.com',
  'from:lufthansa.com',
  'from:wizzair.com',
  'from:vueling.com',
  'from:airbaltic.com',
  'from:klm.com',
  'from:airfrance.com',
  // OTAs (Online Travel Agencies)
  'from:trip.com',
  'from:booking.com',
  'from:expedia.com',
  'from:skyscanner.com',
  'from:kayak.com',
  // More airlines
  'from:pegasus.com',
  'from:flypgs.com',
  'from:bangkokair.com',
  'from:turkishairlines.com',
  'from:emirates.com',
  'from:qatarairways.com',
];

// Content-based search for forwarded emails
const AIRLINE_CONTENT_QUERIES = [
  'subject:ryanair',
  'subject:easyjet',
  'subject:lufthansa',
  'subject:"wizz air"',
  'subject:vueling',
  'subject:airbaltic',
  'subject:klm',
  'subject:"air france"',
  // For forwarded emails - search by content patterns
  '"Ryanair DAC"',           // Ryanair footer
  '"ryanairmail.com"',       // Ryanair sender domain in forwarded headers
  '"Ryanair Travel Itinerary"', // Ryanair itinerary subject
  '"easyJet booking reference"', // EasyJet booking confirmation
  // OTAs
  '"Trip.com"',
  '"Бронирование авиабилета подтверждено"', // Trip.com Russian subject
  '"flight booking confirmed"',
  '"электронные билеты выпущены"', // Trip.com Russian
];

// Flight number patterns - more comprehensive
const FLIGHT_PATTERNS = [
  // EasyJet "YOUR FLIGHT" section: just "EJU3755" on its own line
  /YOUR\s+FLIGHT\s+(?:[\s\S]{0,50}?)(EJU)(\d{3,4})/gi,
  // EasyJet subject format: "Milan-Barcelona, U2 3755" or "Lisbon-Milan, U2 7669"
  /,\s*(U2)\s+(\d{3,4})/gi,
  // EasyJet specific: "EZY1234" or "U2 1234" or "U21234" or "EJU1234"
  /\b(EZY)\s?(\d{3,4})\b/gi,
  /\b(EJU)\s?(\d{3,4})\b/gi,
  /\b(U2)\s+(\d{3,4})\b/gi,
  /\b(U2)(\d{4})\b/gi,
  // Ryanair: "FR 1234"
  /\b(FR)\s?(\d{3,4})\b/gi,
  // Lufthansa: "LH 1234"
  /\b(LH)\s?(\d{3,4})\b/gi,
  // Wizz Air: "W6 1234" or "W61234"
  /\b(W6)\s?(\d{3,4})\b/gi,
  // Vueling: "VY 1234"
  /\b(VY)\s?(\d{3,4})\b/gi,
  // airBaltic: "BT 1234"
  /\b(BT)\s?(\d{3,4})\b/gi,
  // KLM: "KL 1234"
  /\b(KL)\s?(\d{3,4})\b/gi,
  // Air France: "AF 1234"
  /\b(AF)\s?(\d{3,4})\b/gi,
  // Pegasus Airlines: "PC 1234"
  /\b(PC)\s?(\d{3,4})\b/gi,
  // Bangkok Airways: "PG 184"
  /\b(PG)\s?(\d{3,4})\b/gi,
  // Turkish Airlines: "TK 1234"
  /\b(TK)\s?(\d{3,4})\b/gi,
  // Emirates: "EK 1234"
  /\b(EK)\s?(\d{3,4})\b/gi,
  // Qatar Airways: "QR 1234"
  /\b(QR)\s?(\d{3,4})\b/gi,
  // Aeroflot: "SU 1234"
  /\b(SU)\s?(\d{3,4})\b/gi,
  // S7 Airlines: "S7 1234"
  /\b(S7)\s?(\d{3,4})\b/gi,
  // Ural Airlines: "U6 1234"
  /\b(U6)\s?(\d{3,4})\b/gi,
  // Pobeda: "DP 1234"
  /\b(DP)\s?(\d{3,4})\b/gi,
  // Iberia: "IB 1234"
  /\b(IB)\s?(\d{3,4})\b/gi,
  // British Airways: "BA 1234"
  /\b(BA)\s?(\d{3,4})\b/gi,
  // Norwegian: "DY 1234"
  /\b(DY)\s?(\d{3,4})\b/gi,
  // SAS: "SK 1234"
  /\b(SK)\s?(\d{3,4})\b/gi,
  // Finnair: "AY 1234"
  /\b(AY)\s?(\d{3,4})\b/gi,
  // Swiss: "LX 1234"
  /\b(LX)\s?(\d{3,4})\b/gi,
  // Austrian: "OS 1234"
  /\b(OS)\s?(\d{3,4})\b/gi,
  // LOT Polish: "LO 1234"
  /\b(LO)\s?(\d{3,4})\b/gi,
  // TAP Portugal: "TP 1234"
  /\b(TP)\s?(\d{3,4})\b/gi,
  // Aegean: "A3 1234"
  /\b(A3)\s?(\d{3,4})\b/gi,
];

// City names for route detection (major European airports + Ryanair hubs)
const CITIES = [
  // UK & Ireland
  'London', 'Luton', 'Gatwick', 'Stansted', 'Heathrow', 'Manchester', 'Birmingham', 'Bristol', 'Edinburgh', 'Glasgow', 'Liverpool', 'Leeds', 'Newcastle', 'Belfast', 'Dublin', 'Cork', 'Shannon',
  // Italy
  'Milan', 'Malpensa', 'Bergamo', 'Rome', 'Fiumicino', 'Ciampino', 'Naples', 'Venice', 'Treviso', 'Bologna', 'Pisa', 'Florence', 'Turin', 'Bari', 'Catania', 'Palermo', 'Cagliari', 'Alghero', 'Olbia', 'Brindisi', 'Verona', 'Genoa', 'Trieste',
  // Spain & Portugal
  'Barcelona', 'Madrid', 'Malaga', 'Alicante', 'Valencia', 'Seville', 'Palma', 'Ibiza', 'Tenerife', 'Gran Canaria', 'Lanzarote', 'Fuerteventura', 'Girona', 'Reus', 'Santander', 'Bilbao', 'Santiago', 'Porto', 'Lisbon', 'Faro',
  // Germany & Austria
  'Berlin', 'Frankfurt', 'Munich', 'Dusseldorf', 'Hamburg', 'Cologne', 'Bonn', 'Cologne/Bonn', 'Stuttgart', 'Nuremberg', 'Bremen', 'Hannover', 'Leipzig', 'Dresden', 'Dortmund', 'Weeze', 'Memmingen', 'Baden', 'Vienna', 'Salzburg', 'Innsbruck', 'Graz', 'Hahn', 'Frankfurt-Hahn',
  // France & Benelux
  'Paris', 'Beauvais', 'Marseille', 'Nice', 'Lyon', 'Toulouse', 'Bordeaux', 'Nantes', 'Lille', 'Brussels', 'Charleroi', 'Amsterdam', 'Eindhoven', 'Rotterdam',
  // Central/Eastern Europe
  'Prague', 'Budapest', 'Warsaw', 'Krakow', 'Wroclaw', 'Gdansk', 'Poznan', 'Katowice', 'Bratislava', 'Vienna', 'Ljubljana', 'Zagreb', 'Split', 'Dubrovnik', 'Zadar', 'Pula',
  // Nordics & Baltics
  'Copenhagen', 'Stockholm', 'Gothenburg', 'Malmo', 'Oslo', 'Bergen', 'Helsinki', 'Riga', 'Tallinn', 'Vilnius', 'Kaunas',
  // Greece & Cyprus
  'Athens', 'Thessaloniki', 'Crete', 'Heraklion', 'Chania', 'Rhodes', 'Corfu', 'Santorini', 'Mykonos', 'Zakynthos', 'Kos', 'Paphos', 'Larnaca',
  // Other European
  'Malta', 'Sofia', 'Bucharest', 'Belgrade', 'Marrakech', 'Agadir', 'Fes', 'Tangier', 'Tel Aviv', 'Amman', 'Eilat',
  // Turkey
  'Istanbul', 'Стамбул', 'Antalya', 'Ankara', 'Izmir', 'Bodrum', 'Dalaman', 'Sabiha', 'Gökçen',
  // Russia & CIS
  'Moscow', 'Москва', 'Sheremetyevo', 'Domodedovo', 'Vnukovo', 'St. Petersburg', 'Saint Petersburg', 'Санкт-Петербург', 'Pulkovo', 'Пулково', 'Sochi', 'Kazan', 'Yekaterinburg', 'Novosibirsk', 'Krasnodar', 'Kaliningrad', 'Минск', 'Minsk', 'Kyiv', 'Київ', 'Boryspil',
  // Asia
  'Bangkok', 'Бангкок', 'Suvarnabhumi', 'Don Mueang', 'Phuket', 'Ko Samui', 'Samui', 'Ко Самуи', 'Chiang Mai', 'Krabi', 'Singapore', 'Сингапур', 'Kuala Lumpur', 'Bali', 'Denpasar', 'Jakarta', 'Hong Kong', 'Гонконг', 'Tokyo', 'Токио', 'Narita', 'Haneda', 'Seoul', 'Incheon', 'Beijing', 'Пекин', 'Shanghai', 'Шанхай', 'Dubai', 'Дубай', 'Abu Dhabi', 'Doha', 'Delhi', 'Mumbai', 'Goa',
  // Transliterated Russian cities
  'Милан', 'Рим', 'Париж', 'Лондон', 'Берлин', 'Барселона', 'Мадрид'
].join('|');
// Route pattern: "Milan-Barcelona" or "Milan to Barcelona" or "Milan → Barcelona"
const CITY_ROUTE_PATTERN = new RegExp(`(${CITIES})\\s*(?:to|→|-|–)\\s*(${CITIES})`, 'gi');

// Date patterns - prefer formats with year
const DATE_PATTERNS_WITH_YEAR = [
  // "25-05-2024" or "25/05/2024" or "25.05.2024" (preferred - has year)
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
  // "2024-05-25"
  /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
  // "25 May 2024" or "25 May, 2024"
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,]?\s+(\d{4})/gi,
  // "May 25, 2024"
  /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})[,]?\s+(\d{4})/gi,
  // Russian: "17 ноября 2024 г." or "17 нояб. 2024"
  /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)[.\s]*(\d{4})/gi,
];

// Date patterns without year (will infer year from email date)
const DATE_PATTERNS_NO_YEAR = [
  // "Sun 09 Jun" or "Thu 06 Jun" or "09 Jun"
  /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi,
  // Russian without year: "17 ноября" or "17 нояб."
  /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/gi,
];

const MONTH_MAP: Record<string, string> = {
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  // Russian full month names (genitive case)
  'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04', 'мая': '05', 'июня': '06',
  'июля': '07', 'августа': '08', 'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
  // Russian abbreviated
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'май': '05', 'июн': '06',
  'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
};

// Booking reference patterns - EasyJet uses 6-7 char codes like K7FJS1Z
const BOOKING_REF_PATTERNS = [
  // Ryanair: "Reservation: HIYFTL" (in subject or body)
  /Reservation[:\s]+([A-Z0-9]{6})/gi,
  // "Your booking K7FJS1Z:" or "booking K7G7F5N"
  /(?:your\s+)?booking\s+([A-Z0-9]{6,7})[\s:,]/gi,
  // "Booking Reference K7G7F5N"
  /booking\s*(?:reference|ref|number|code)?[:\s]*([A-Z0-9]{6,8})/gi,
  // "easyJet booking reference: K7G7F5N"
  /easyjet\s+booking\s+reference[:\s]*([A-Z0-9]{6,7})/gi,
  // "confirmation: K7FJS1Z"
  /confirmation[:\s]*([A-Z0-9]{6,8})/gi,
  // "PNR: ABC123"
  /PNR[:\s]*([A-Z0-9]{6})/gi,
  // "reference: K7FJS1Z"
  /reference[:\s]+([A-Z0-9]{6,7})/gi,
  // Ryanair subject pattern: "HIYFTL | Getting ready"
  /\b([A-Z0-9]{6})\s*\|/gi,
  // Standalone 6-7 char alphanumeric that looks like booking ref (starts with letter)
  /\b([A-Z][A-Z0-9]{5,6})\b/g,
];

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

    // Search for emails from airlines (last 3 years)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const afterDate = threeYearsAgo.toISOString().split('T')[0].replace(/-/g, '/');

    // Combine from: queries and content queries for comprehensive search
    const allQueries = [...AIRLINE_FROM_QUERIES, ...AIRLINE_CONTENT_QUERIES];
    const query = `(${allQueries.join(' OR ')}) after:${afterDate}`;

    console.log('Searching Gmail with query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100, // Increased to catch more flight emails
    });

    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} messages`);

    // Group by flight number (not booking ref) - each flight can have different delay
    const flightData: Map<string, FlightInfo> = new Map();

    // Get details for each message (process up to 50 for performance)
    for (const msg of messages.slice(0, 50)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const snippet = detail.data.snippet || '';

        const bodyText = extractBodyText(detail.data.payload);
        const textToSearch = `${subject} ${snippet} ${bodyText}`;

        // Extract booking reference
        let bookingRef = '';
        for (const pattern of BOOKING_REF_PATTERNS) {
          pattern.lastIndex = 0;
          const match = pattern.exec(textToSearch);
          if (match) {
            bookingRef = match[1].toUpperCase();
            break;
          }
        }

        // Extract ALL flight numbers with their positions in the email
        const flightMatches: Array<{flightNumber: string, position: number}> = [];
        for (const pattern of FLIGHT_PATTERNS) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(textToSearch)) !== null) {
            let fn = `${match[1]}${match[2]}`.replace(/\s/g, '').toUpperCase();
            if (fn.startsWith('EZY') || fn.startsWith('EJU')) {
              fn = 'U2' + fn.slice(3);
            }
            if (!flightMatches.find(f => f.flightNumber === fn)) {
              flightMatches.push({ flightNumber: fn, position: match.index });
            }
          }
        }

        // Skip if no flight numbers found
        if (flightMatches.length === 0) continue;

        console.log(`Found ${flightMatches.length} flight(s) in email: ${flightMatches.map(f => f.flightNumber).join(', ')}`);

        // Process each flight number found in this email
        for (const flightMatch of flightMatches) {
          const flightNumber = flightMatch.flightNumber;

          // Get context around this flight number (1500 chars before and after for better coverage)
          const contextStart = Math.max(0, flightMatch.position - 1500);
          const contextEnd = Math.min(textToSearch.length, flightMatch.position + 1500);
          const flightContext = textToSearch.substring(contextStart, contextEnd);

        // Extract flight date - prefer dates with year, search in context first
        let flightDate = '';
        let hasYear = false;

        // Helper to normalize date to dd/mm/yyyy format
        const normalizeDate = (match: RegExpExecArray): string => {
          const fullMatch = match[0];
          // Check if it's a Russian date pattern (has Cyrillic month)
          if (/[а-яА-Я]/.test(fullMatch)) {
            const day = match[1].padStart(2, '0');
            const monthStr = match[2].toLowerCase();
            const month = MONTH_MAP[monthStr] || '01';
            const year = match[3];
            return `${day}/${month}/${year}`;
          }
          // Check if it's English month name pattern
          if (/[a-zA-Z]/.test(fullMatch)) {
            // Could be "25 May 2024" or "May 25, 2024"
            const hasMonthFirst = /^[a-zA-Z]/.test(fullMatch.trim());
            if (hasMonthFirst) {
              const monthStr = match[1].toLowerCase().substring(0, 3);
              const day = match[2].padStart(2, '0');
              const year = match[3];
              const month = MONTH_MAP[monthStr] || '01';
              return `${day}/${month}/${year}`;
            } else {
              const day = match[1].padStart(2, '0');
              const monthStr = match[2].toLowerCase().substring(0, 3);
              const year = match[3];
              const month = MONTH_MAP[monthStr] || '01';
              return `${day}/${month}/${year}`;
            }
          }
          // Already numeric format
          return fullMatch;
        };

        // First try patterns with year in flight context
        for (const pattern of DATE_PATTERNS_WITH_YEAR) {
          pattern.lastIndex = 0;
          const match = pattern.exec(flightContext);
          if (match) {
            flightDate = normalizeDate(match);
            hasYear = true;
            console.log(`Date found: "${match[0]}" -> normalized to "${flightDate}" for ${flightNumber}`);
            break;
          }
        }

        // If no date with year found, try patterns without year
        if (!flightDate) {
          for (const pattern of DATE_PATTERNS_NO_YEAR) {
            pattern.lastIndex = 0;
            const match = pattern.exec(flightContext);
            if (match) {
              const day = match[1].padStart(2, '0');
              const monthStr = match[2].toLowerCase();
              const month = MONTH_MAP[monthStr] || '01';
              // Infer year from email received date
              const emailYear = date ? new Date(date).getFullYear() : new Date().getFullYear();
              flightDate = `${day}/${month}/${emailYear}`;
              console.log(`Inferred date with year: ${flightDate} from "${match[0]}" for ${flightNumber}`);
              break;
            }
          }
        }

        // Extract route - try multiple patterns, search in flight context first
        let route = '';

        // Debug: show context for this flight
        console.log(`Context for ${flightNumber}: "${flightContext.substring(0, 200).replace(/\s+/g, ' ')}..."`);

        // Pattern 1: "City [Airport] to City" format (EasyJet confirmation: "Milan Malpensa (T2) to Barcelona (Terminal 2C)")
        const cityToMatch = flightContext.match(new RegExp(`(${CITIES})\\s+(?:Malpensa|Airport|Luton|Gatwick|Stansted|Heathrow)?\\s*(?:\\([^)]*\\))?\\s+to\\s+(${CITIES})`, 'i'));
        if (cityToMatch) {
          route = `${cityToMatch[1]} → ${cityToMatch[2]}`;
          console.log(`Route matched City to City format: ${route}`);
        }

        // Pattern 2: "City-City, U2" format (EasyJet email header like "Milan-Barcelona, U2 3755")
        if (!route) {
          const cityDashU2Match = flightContext.match(new RegExp(`(${CITIES})\\s*[-–—]\\s*(${CITIES})\\s*,\\s*U2`, 'i'));
          if (cityDashU2Match) {
            route = `${cityDashU2Match[1]} → ${cityDashU2Match[2]}`;
            console.log(`Route matched City-City, U2 format: ${route}`);
          }
        }

        // Pattern 3: Ryanair format "Milan (Bergamo) - Cologne (Bonn)" with airport in parentheses
        if (!route) {
          const ryanairRouteMatch = flightContext.match(new RegExp(`(${CITIES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITIES})`, 'i'));
          if (ryanairRouteMatch) {
            route = `${ryanairRouteMatch[1]} → ${ryanairRouteMatch[2]}`;
            console.log(`Route matched Ryanair City (Airport) - City format: ${route}`);
          }
        }

        // Pattern 3b: Generic "City-City" anywhere in context
        if (!route) {
          const cityDashMatch = flightContext.match(new RegExp(`(${CITIES})\\s*[-–—]\\s*(${CITIES})`, 'i'));
          if (cityDashMatch) {
            route = `${cityDashMatch[1]} → ${cityDashMatch[2]}`;
            console.log(`Route matched City-City format: ${route}`);
          }
        }

        // Pattern 4: "from X to Y" in context
        if (!route) {
          const fromToMatch = flightContext.match(new RegExp(`from\\s+(${CITIES})\\s+to\\s+(${CITIES})`, 'i'));
          if (fromToMatch) {
            route = `${fromToMatch[1]} → ${fromToMatch[2]}`;
            console.log(`Route matched from-to format: ${route}`);
          }
        }

        // Pattern 5: "To [City]" right before flight number (Ryanair: "To Cologne (Bonn) FR5531")
        if (!route) {
          const toFlightMatch = flightContext.match(new RegExp(`To\\s+(${CITIES})(?:\\s*\\([^)]+\\))?\\s*${flightNumber}`, 'i'));
          if (toFlightMatch) {
            route = `→ ${toFlightMatch[1]}`;
            console.log(`Route matched "To City FRxxxx" format: ${route}`);
          }
        }

        // Pattern 5b: "flight to [City]" - extract at least destination (fallback)
        if (!route) {
          const flightToMatch = flightContext.match(new RegExp(`(?:your\\s+)?flight\\s+to\\s+(${CITIES})`, 'i'));
          if (flightToMatch) {
            route = `→ ${flightToMatch[1]}`;
            console.log(`Route matched destination only: ${route}`);
          }
        }

        // Pattern 5c: Ryanair "Your flight details for [City]" or "your trip to [City]"
        if (!route) {
          const flightDetailsMatch = flightContext.match(new RegExp(`(?:flight\\s+details\\s+for|your\\s+trip\\s+to)\\s+(${CITIES}(?:/[A-Za-z]+)?)`, 'i'));
          if (flightDetailsMatch) {
            route = `→ ${flightDetailsMatch[1]}`;
            console.log(`Route matched Ryanair flight details format: ${route}`);
          }
        }

        // Pattern 6: Trip.com Russian format - "Аэропорт [City] ... PCxxx ... Аэропорт [City]"
        // Look for airport before and after flight number
        if (!route) {
          // Russian airport names mapping
          const russianAirportToCity: Record<string, string> = {
            'бергамо': 'Bergamo', 'милан': 'Milan', 'мальпенса': 'Milan',
            'стамбул': 'Istanbul', 'сабихи': 'Istanbul', 'гёкчен': 'Istanbul',
            'пулково': 'St. Petersburg', 'санкт-петербург': 'St. Petersburg',
            'шереметьево': 'Moscow', 'домодедово': 'Moscow', 'внуково': 'Moscow',
            'бангкок': 'Bangkok', 'суварнабхуми': 'Bangkok',
            'самуи': 'Ko Samui', 'ко самуи': 'Ko Samui',
            'пхукет': 'Phuket', 'барселона': 'Barcelona', 'рим': 'Rome',
          };

          // Find flight number position in context
          const fnPos = flightContext.indexOf(flightNumber);
          if (fnPos > 0) {
            const beforeFlight = flightContext.substring(0, fnPos).toLowerCase();
            const afterFlight = flightContext.substring(fnPos).toLowerCase();

            // Look for "аэропорт [name]" pattern
            let originCity = '';
            let destCity = '';

            // Find last airport mention before flight number
            const beforeAirportMatch = beforeFlight.match(/аэропорт\s+([а-яё\s]+?)(?:\s+орио|\s+имени|\s+t\d|\s*$)/gi);
            if (beforeAirportMatch) {
              const lastMatch = beforeAirportMatch[beforeAirportMatch.length - 1];
              const airportName = lastMatch.replace(/аэропорт\s+/i, '').replace(/\s+(орио|имени|t\d).*/i, '').trim().toLowerCase();
              for (const [key, city] of Object.entries(russianAirportToCity)) {
                if (airportName.includes(key)) {
                  originCity = city;
                  break;
                }
              }
            }

            // Find first airport mention after flight number
            const afterAirportMatch = afterFlight.match(/аэропорт\s+([а-яё\s]+?)(?:\s+орио|\s+имени|\s+t\d|\s*пересадка|\s*\d)/i);
            if (afterAirportMatch) {
              const airportName = afterAirportMatch[1].trim().toLowerCase();
              for (const [key, city] of Object.entries(russianAirportToCity)) {
                if (airportName.includes(key)) {
                  destCity = city;
                  break;
                }
              }
            }

            if (originCity && destCity && originCity !== destCity) {
              route = `${originCity} → ${destCity}`;
              console.log(`Route matched Trip.com Russian format: ${route}`);
            }
          }
        }

        // Pattern 7: IATA codes "BGY - CGN" in context
        if (!route) {
          const iataMatch = flightContext.match(/\b([A-Z]{3})\s*(?:to|→|-|–|>)\s*([A-Z]{3})\b/i);
          if (iataMatch) {
            const [, origin, dest] = iataMatch;
            // Convert common IATA codes to city names
            const iataToCity: Record<string, string> = {
              'DUB': 'Dublin', 'STN': 'London Stansted', 'LTN': 'London Luton', 'LGW': 'London Gatwick', 'LHR': 'London Heathrow',
              'BGY': 'Bergamo', 'MXP': 'Milan Malpensa', 'LIN': 'Milan Linate', 'FCO': 'Rome Fiumicino', 'CIA': 'Rome Ciampino',
              'BCN': 'Barcelona', 'MAD': 'Madrid', 'AGP': 'Malaga', 'ALC': 'Alicante', 'PMI': 'Palma',
              'BER': 'Berlin', 'FRA': 'Frankfurt', 'MUC': 'Munich', 'CGN': 'Cologne/Bonn', 'DUS': 'Dusseldorf', 'HHN': 'Frankfurt-Hahn',
              'CDG': 'Paris CDG', 'ORY': 'Paris Orly', 'BVA': 'Paris Beauvais', 'MRS': 'Marseille', 'NCE': 'Nice',
              'AMS': 'Amsterdam', 'BRU': 'Brussels', 'CRL': 'Charleroi', 'EIN': 'Eindhoven',
              'VIE': 'Vienna', 'PRG': 'Prague', 'BUD': 'Budapest', 'WAW': 'Warsaw', 'KRK': 'Krakow',
              'CPH': 'Copenhagen', 'ARN': 'Stockholm', 'OSL': 'Oslo', 'HEL': 'Helsinki',
              'RIX': 'Riga', 'TLL': 'Tallinn', 'VNO': 'Vilnius',
              'ATH': 'Athens', 'SKG': 'Thessaloniki', 'HER': 'Heraklion',
              'LIS': 'Lisbon', 'OPO': 'Porto', 'FAO': 'Faro',
              'NAP': 'Naples', 'VCE': 'Venice', 'BLQ': 'Bologna', 'PSA': 'Pisa', 'CTA': 'Catania', 'PMO': 'Palermo',
              'MAN': 'Manchester', 'BHX': 'Birmingham', 'BRS': 'Bristol', 'EDI': 'Edinburgh', 'GLA': 'Glasgow', 'LPL': 'Liverpool',
              'SNN': 'Shannon', 'ORK': 'Cork', 'BFS': 'Belfast',
              'MLA': 'Malta', 'SOF': 'Sofia', 'OTP': 'Bucharest', 'TFS': 'Tenerife', 'LPA': 'Gran Canaria', 'ACE': 'Lanzarote',
              'IBZ': 'Ibiza', 'VLC': 'Valencia', 'SVQ': 'Seville', 'ZAG': 'Zagreb', 'SPU': 'Split', 'DBV': 'Dubrovnik',
              'RAK': 'Marrakech', 'AGA': 'Agadir', 'FEZ': 'Fes', 'TNG': 'Tangier',
              // Turkey
              'IST': 'Istanbul', 'SAW': 'Istanbul Sabiha', 'AYT': 'Antalya', 'ADB': 'Izmir', 'BJV': 'Bodrum', 'DLM': 'Dalaman',
              // Russia
              'SVO': 'Moscow Sheremetyevo', 'DME': 'Moscow Domodedovo', 'VKO': 'Moscow Vnukovo', 'LED': 'St. Petersburg', 'AER': 'Sochi', 'KZN': 'Kazan', 'SVX': 'Yekaterinburg', 'KRR': 'Krasnodar', 'KGD': 'Kaliningrad',
              // Asia
              'BKK': 'Bangkok', 'DMK': 'Bangkok Don Mueang', 'USM': 'Ko Samui', 'HKT': 'Phuket', 'CNX': 'Chiang Mai', 'KBV': 'Krabi',
              'SIN': 'Singapore', 'KUL': 'Kuala Lumpur', 'DPS': 'Bali', 'CGK': 'Jakarta',
              'HKG': 'Hong Kong', 'NRT': 'Tokyo Narita', 'HND': 'Tokyo Haneda', 'ICN': 'Seoul Incheon',
              'PEK': 'Beijing', 'PVG': 'Shanghai', 'DXB': 'Dubai', 'AUH': 'Abu Dhabi', 'DOH': 'Doha',
              'DEL': 'Delhi', 'BOM': 'Mumbai', 'GOI': 'Goa'
            };
            const originCity = iataToCity[origin.toUpperCase()] || origin;
            const destCity = iataToCity[dest.toUpperCase()] || dest;
            route = `${originCity} → ${destCity}`;
            console.log(`Route matched IATA code format: ${route}`);
          }
        }

        // FALLBACK: If no route/date found in context, search full email text
        if (!route || !flightDate) {
          console.log(`Fallback to full text search for ${flightNumber}`);

          if (!route) {
            // Try to find route in full text
            const fullRouteMatch = textToSearch.match(new RegExp(`(${CITIES})\\s*\\([^)]+\\)\\s*[-–—]\\s*(${CITIES})`, 'i'));
            if (fullRouteMatch) {
              route = `${fullRouteMatch[1]} → ${fullRouteMatch[2]}`;
              console.log(`Fallback route matched: ${route}`);
            } else {
              const fullCityDash = textToSearch.match(new RegExp(`(${CITIES})\\s*[-–—]\\s*(${CITIES})`, 'i'));
              if (fullCityDash) {
                route = `${fullCityDash[1]} → ${fullCityDash[2]}`;
                console.log(`Fallback route (city-city): ${route}`);
              }
            }
          }

          if (!flightDate) {
            // Try to find date in full text
            for (const pattern of DATE_PATTERNS_WITH_YEAR) {
              pattern.lastIndex = 0;
              const match = pattern.exec(textToSearch);
              if (match) {
                flightDate = match[0];
                console.log(`Fallback date: ${flightDate}`);
                break;
              }
            }
          }
        }

        console.log(`Flight ${flightNumber}: route="${route}", date="${flightDate}"`);

        // Group by flight number
        const existing = flightData.get(flightNumber);
        if (existing) {
          // Merge: fill in missing data, prefer full data over partial
          if (bookingRef && existing.bookingRef === '-') {
            existing.bookingRef = bookingRef;
          }
          // Prefer dates with year (contains /)
          if (flightDate && (existing.date === 'Check email' || !existing.date.includes('/'))) {
            existing.date = flightDate;
          }
          // Prefer full route (City → City) over partial (→ City)
          if (route && (existing.route === 'Check email' || (existing.route.startsWith('→') && !route.startsWith('→')))) {
            existing.route = route;
          }
        } else {
          flightData.set(flightNumber, {
            id: msg.id!,
            flightNumber,
            date: flightDate || 'Check email',
            route: route || 'Check email',
            bookingRef: bookingRef || '-',
            subject: subject.substring(0, 80),
            from: extractEmailDomain(from),
            snippet: snippet.substring(0, 100) + '...',
            receivedAt: date,
          });
        }
        } // end for flightNumber loop
      } catch (err) {
        console.error('Error fetching message:', err);
      }
    }

    // Convert map to array
    let flights = Array.from(flightData.values());

    // Post-process: infer return routes from same booking
    // Group flights by booking ref
    const bookingGroups = new Map<string, typeof flights>();
    for (const flight of flights) {
      if (flight.bookingRef && flight.bookingRef !== '-') {
        const group = bookingGroups.get(flight.bookingRef) || [];
        group.push(flight);
        bookingGroups.set(flight.bookingRef, group);
      }
    }

    // Helper to parse date string to comparable value
    const parseFlightDate = (dateStr: string): number => {
      if (!dateStr || dateStr === 'Check email') return 0;
      // Try "dd/mm/yyyy" or "dd.mm.yyyy" or "dd-mm-yyyy"
      const match = dateStr.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
      if (match) {
        const [, day, month, year] = match;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
      }
      // Try parsing as-is
      const parsed = Date.parse(dateStr);
      return isNaN(parsed) ? 0 : parsed;
    };

    // For flights with partial route (→ City), try to infer full route from same booking
    for (const [bookingRef, group] of bookingGroups) {
      if (group.length >= 2) {
        // Find flight with full route
        const withFullRoute = group.find(f => f.route.includes('→') && !f.route.startsWith('→'));
        // Find flight with partial route
        const withPartialRoute = group.find(f => f.route.startsWith('→'));

        if (withFullRoute && withPartialRoute) {
          // Parse the full route
          const routeMatch = withFullRoute.route.match(/(.+)\s*→\s*(.+)/);
          if (routeMatch) {
            const [, origin, destination] = routeMatch;
            // If partial route destination matches full route origin, this is the return flight
            if (withPartialRoute.route === `→ ${origin.trim()}`) {
              withPartialRoute.route = `${destination.trim()} → ${origin.trim()}`;
              console.log(`Inferred return route for ${withPartialRoute.flightNumber}: ${withPartialRoute.route}`);
            }
          }
        }

        // NEW: Handle case where both flights have identical routes (fallback found same route for both)
        // If two flights have the same "A → B" route but different dates, the later one is return "B → A"
        const flightsWithSameRoute = group.filter(f => f.route.includes('→') && !f.route.startsWith('→'));
        if (flightsWithSameRoute.length === 2) {
          const [flight1, flight2] = flightsWithSameRoute;
          if (flight1.route === flight2.route) {
            // Routes are identical - one should be the return flight
            const date1 = parseFlightDate(flight1.date);
            const date2 = parseFlightDate(flight2.date);

            // The later flight is the return
            const laterFlight = date1 > date2 ? flight1 : date2 > date1 ? flight2 : null;

            if (laterFlight) {
              const routeMatch = laterFlight.route.match(/(.+)\s*→\s*(.+)/);
              if (routeMatch) {
                const [, origin, destination] = routeMatch;
                laterFlight.route = `${destination.trim()} → ${origin.trim()}`;
                console.log(`Fixed return route for ${laterFlight.flightNumber}: ${laterFlight.route} (later date)`);
              }
            }
          }
        }
      }
    }

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

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '-')
    .replace(/&#45;/g, '-')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&rarr;/g, '→')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Extract text from email body (handles multipart)
function extractBodyText(payload: any): string {
  if (!payload) return '';

  let text = '';

  // Direct body
  if (payload.body?.data) {
    text += decodeBase64(payload.body.data);
  }

  // Multipart
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text += decodeBase64(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        // Strip HTML tags and decode entities for searching
        const html = decodeBase64(part.body.data);
        const stripped = html.replace(/<[^>]*>/g, ' ');
        text += decodeHtmlEntities(stripped);
      } else if (part.parts) {
        // Nested multipart
        text += extractBodyText(part);
      }
    }
  }

  return text;
}

function decodeBase64(data: string): string {
  try {
    // Gmail uses URL-safe base64
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    return decoded;
  } catch {
    return '';
  }
}

function extractEmailDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  if (match) {
    return match[1].toLowerCase();
  }
  return from;
}
