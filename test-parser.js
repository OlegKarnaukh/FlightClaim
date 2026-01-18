/**
 * Test script for FlightClaim parser
 * Run with: node test-parser.js
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// PARSER LOGIC
// ============================================================================

const AIRLINE_DOMAINS = [
  'ryanair.com', 'easyjet.com', 'lufthansa.com', 'wizzair.com', 'vueling.com',
  'flypgs.com', 'airfrance.com', 'klm.com', 'trip.com', 'booking.com',
];

const AIRLINE_CODES = new Set([
  'FR', 'U2', 'LH', 'W6', 'VY', 'BT', 'KL', 'AF', 'BA', 'IB', 'TK', 'EK', 'QR',
  'PC', 'PG', 'SU', 'S7', 'TG', 'EZY', 'EJU',
  // New airlines for tests 11-20
  'UA', 'AZ', 'I2', 'LO', 'FZ', 'FY', // United, ITA, Iberia Express, LOT, flydubai, Kiwi
  // New airlines for tests 21-30
  'NH', 'DL', 'CA', 'WN', 'DY', 'KE', 'B6', 'A3', // ANA, Delta, Air China, Southwest, Norwegian, Korean Air, JetBlue, Aegean
]);

const AIRPORT_CODES = new Set([
  'LHR', 'LGW', 'STN', 'LTN', 'MAN', 'DUB', 'FRA', 'MUC', 'BER', 'DUS',
  'FCO', 'MXP', 'BGY', 'VCE', 'NAP', 'MAD', 'BCN', 'PMI', 'AGP',
  'CDG', 'ORY', 'AMS', 'BRU', 'VIE', 'ZRH', 'PRG', 'BUD', 'WAW',
  'CPH', 'ARN', 'OSL', 'HEL', 'RIX', 'ATH', 'LIS', 'OPO',
  'IST', 'SAW', 'AYT', 'SVO', 'LED', 'DXB', 'DOH',
  'BKK', 'HKT', 'USM', 'SIN', 'NRT', 'JFK',
  // Additional Turkish airports
  'ADB', 'ESB', 'DLM', 'BJV', 'TZX', 'GZT',
  // New airports for tests 11-20
  'SFO', 'LIN', 'ORD', 'LAX', 'EWR', // San Francisco, Milan Linate, Chicago O'Hare
  // New airports for tests 21-30
  'ATL', 'LAS', 'PHX', 'FLL', // Atlanta, Las Vegas, Phoenix, Fort Lauderdale
]);

const CITY_NAMES = 'London|Paris|Berlin|Rome|Milan|Madrid|Barcelona|Amsterdam|Frankfurt|Munich|Vienna|Prague|Budapest|Warsaw|Dublin|Brussels|Lisbon|Athens|Stockholm|Copenhagen|Istanbul|Moscow|Bangkok|Phuket|Singapore|Dubai|Gatwick|Stansted|Милан|Стамбул|Бангкок';

const PATTERNS = {
  bookingRef: [
    /(?:booking|confirmation|reservation|pnr|reference|бронирован|код\s*бронирования|booking\s*code)[:\s#]+([A-Z0-9]{6,7})\b/gi,
    /(?:Booking\s+Reference)[^A-Z0-9]*([A-Z0-9]{6})\b/gi, // Table format: "Booking Reference ... ABC123"
    /(?:Confirmation\s+Code)[:\s]*([A-Z0-9]{5,7})\b/gi, // Expedia format: "Confirmation Code: UA5K7M"
    /\b([A-Z]{2,3}[0-9]{3,4})\b/g, // Pattern like ABC123, XY1234
    /\b([A-Z][0-9][A-Z0-9]{4,5})\b/g, // Must have digit (avoids "RYANAIR")
  ],
  flightNumber: /\b(EZY|EJU|TG|PG|[A-Z][A-Z0-9])\s*(\d{1,4})\b/g,
  airportRoute: /\b([A-Z]{3})\s*(?:to|→|->|-|–)\s*([A-Z]{3})\b/gi,
  date: [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
    // English: "10 September 2026" or "September 10, 2026"
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/gi,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi,
    // Russian
    /(\d{1,2})\s+(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+(\d{4})/gi,
    // Italian: "22 settembre 2026"
    /(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/gi,
    // Spanish: "12 de noviembre de 2026"
    /(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de)?\s+(\d{4})/gi,
    // Polish: "18 grudnia 2026"
    /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\s+(\d{4})/gi,
    // Japanese: "2027年3月5日" or "5 March 2027"
    /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
    // Korean: "2027년 9월 25일"
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/g,
    // Greek: "15 Ιουλίου 2027"
    /(\d{1,2})\s+(Ιανουαρίου|Φεβρουαρίου|Μαρτίου|Απριλίου|Μαΐου|Ιουνίου|Ιουλίου|Αυγούστου|Σεπτεμβρίου|Οκτωβρίου|Νοεμβρίου|Δεκεμβρίου)\s+(\d{4})/gi,
  ],
  passengerName: [
    /(?:Dear|Уважаемый)\s+(?:Mr\.?|Ms\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z]{2,}\/[A-Z]{2,}(?:\s+(?:MR|MS|MRS))?)/g,
    /(?:passenger|пассажир)[:\s]+([A-Z][A-Z\s]+)/gi,
  ],
};

const MONTH_TO_NUM = {
  // English
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  'january': '01', 'february': '02', 'march': '03', 'april': '04', 'june': '06',
  'july': '07', 'august': '08', 'september': '09', 'october': '10', 'november': '11', 'december': '12',
  // Russian
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'мая': '05', 'июн': '06',
  'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
  'нояб': '11',
  // Italian
  'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04', 'maggio': '05', 'giugno': '06',
  'luglio': '07', 'agosto': '08', 'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12',
  'set': '09', 'ott': '10',
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

function parseJsonLD(html) {
  const flights = [];
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
            airline: flight.airline?.iataCode || '',
            from: flight.departureAirport?.iataCode || '',
            to: flight.arrivalAirport?.iataCode || '',
            departureTime: flight.departureTime || '',
            bookingRef: item.reservationNumber || '',
            passengerName: item.underName?.name || '',
            confidence: 100,
          });
        }
      }
    } catch (e) {}
  }

  return flights;
}

function extractText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words that look like booking refs but aren't
const BOOKING_BLACKLIST = new Set([
  'EASYJET', 'RYANAIR', 'WIZZAIR', 'BOOKING', 'DETAILS', 'FLIGHT', 'NUMBER',
  'WIZZ', 'CANCEL', 'PLEASE', 'TRAVEL', 'ONLINE', 'CHECKIN',
]);

function parseWithRegex(text, emailFrom) {
  emailFrom = emailFrom || '';
  const flights = [];

  // Find booking reference
  let bookingRef = '';
  for (const pattern of PATTERNS.bookingRef) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const ref = match[1].toUpperCase();
      // Skip blacklisted words and refs that are all letters (likely words)
      if (!BOOKING_BLACKLIST.has(ref) && /\d/.test(ref)) {
        bookingRef = ref;
        break;
      }
    }
    if (bookingRef) break;
  }

  // Find flight numbers
  const flightNumbers = [];
  const seen = new Set();
  PATTERNS.flightNumber.lastIndex = 0;
  let match;
  while ((match = PATTERNS.flightNumber.exec(text)) !== null) {
    const code = match[1].toUpperCase();
    if (AIRLINE_CODES.has(code) || AIRLINE_CODES.has(code.substring(0, 2))) {
      const key = `${code}${match[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        flightNumbers.push({ code: code, num: match[2], pos: match.index });
      }
    }
  }

  // Find routes - IATA codes with arrow
  const routes = [];
  PATTERNS.airportRoute.lastIndex = 0;
  while ((match = PATTERNS.airportRoute.exec(text)) !== null) {
    const from = match[1].toUpperCase();
    const to = match[2].toUpperCase();
    if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
      routes.push({ from: from, to: to, pos: match.index });
    }
  }

  // Find routes - Format: "City (CODE) → City (CODE)" like "London Gatwick (LGW) → Barcelona (BCN)"
  if (routes.length === 0) {
    const cityCodePattern = /\(([A-Z]{3})\)\s*(?:→|->|to|-|–)\s*[^(]*\(([A-Z]{3})\)/gi;
    while ((match = cityCodePattern.exec(text)) !== null) {
      const from = match[1].toUpperCase();
      const to = match[2].toUpperCase();
      if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
        routes.push({ from: from, to: to, pos: match.index });
      }
    }
  }

  // Find routes - Separate From/To fields with IATA codes in parentheses
  if (routes.length === 0) {
    // Use word boundary to avoid matching "куда" inside "Откуда"
    const fromPattern = /(?:^|\s)(?:From|Откуда)[:\s/]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const toPattern = /(?:^|\s)(?:To(?:\s|:)|Куда)[:\s/]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const fromMatch = fromPattern.exec(text);
    const toMatch = toPattern.exec(text);
    if (fromMatch && toMatch) {
      const from = fromMatch[1].toUpperCase();
      const to = toMatch[1].toUpperCase();
      if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
        routes.push({ from: from, to: to, pos: fromMatch.index });
      }
    }
  }

  // Find routes - Departure/Arrival Airport pattern (Expedia)
  if (routes.length === 0) {
    const depAirportPattern = /Departure\s+Airport[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const arrAirportPattern = /Arrival\s+Airport[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const depMatch = depAirportPattern.exec(text);
    const arrMatch = arrAirportPattern.exec(text);
    if (depMatch && arrMatch) {
      const from = depMatch[1].toUpperCase();
      const to = arrMatch[1].toUpperCase();
      if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
        routes.push({ from: from, to: to, pos: depMatch.index });
      }
    }
  }

  // Find routes - Spanish Salida/Llegada pattern (eDreams)
  if (routes.length === 0) {
    const salidaPattern = /Salida\s+(?:Aeropuerto)?[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const llegadaPattern = /Llegada\s+(?:Aeropuerto)?[:\s]*[^(]{0,50}?\(([A-Z]{3})\)/gi;
    const salidaMatch = salidaPattern.exec(text);
    const llegadaMatch = llegadaPattern.exec(text);
    if (salidaMatch && llegadaMatch) {
      const from = salidaMatch[1].toUpperCase();
      const to = llegadaMatch[1].toUpperCase();
      if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
        routes.push({ from: from, to: to, pos: salidaMatch.index });
      }
    }
  }

  // Find routes - City names
  if (routes.length === 0) {
    const cityPattern = new RegExp('(' + CITY_NAMES + ')\\s*(?:to|→|->|-|–)\\s*(' + CITY_NAMES + ')', 'gi');
    while ((match = cityPattern.exec(text)) !== null) {
      routes.push({ from: match[1], to: match[2], pos: match.index });
    }
  }

  // Find dates
  const dates = [];
  for (const pattern of PATTERNS.date) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      let dateStr = '';
      const m0 = match[0];
      // Japanese/Korean: 2027年3月5日 or 2027년 9월 25일
      if (/年|년/.test(m0)) {
        const year = match[1];
        const month = String(match[2]).padStart(2, '0');
        const day = String(match[3]).padStart(2, '0');
        dateStr = day + '/' + month + '/' + year;
      } else if (/[a-zа-яęΑ-Ωα-ω]/i.test(m0)) {
        // Check if month comes first (US format: "September 10, 2026")
        // First, strip weekday prefix like "Sun", "Mon" etc. before checking
        const dateWithoutWeekday = m0.replace(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,.\s]*/i, '').trim();
        const isMonthFirst = /^[a-zа-яęΑ-Ωα-ω]/i.test(dateWithoutWeekday);
        let day, monthStr, year;
        if (isMonthFirst) {
          monthStr = String(match[1]).toLowerCase();
          day = String(match[2]).padStart(2, '0');
          year = match[3] || '2026';
        } else {
          day = String(match[1]).padStart(2, '0');
          monthStr = String(match[2]).toLowerCase();
          year = match[3] || '2026';
        }
        const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
        dateStr = day + '/' + month + '/' + year;
      } else {
        dateStr = m0;
      }
      if (dateStr) dates.push({ date: dateStr, pos: match.index });
    }
  }

  // Find passenger name
  let passengerName = '';
  for (const pattern of PATTERNS.passengerName) {
    pattern.lastIndex = 0;
    const nameMatch = pattern.exec(text);
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 3) {
      passengerName = nameMatch[1].trim();
      break;
    }
  }

  // Build flights
  for (const fn of flightNumbers) {
    let route = routes[0] || null;
    let minDist = Infinity;
    for (const r of routes) {
      const dist = Math.abs(r.pos - fn.pos);
      if (dist < minDist) { minDist = dist; route = r; }
    }

    let flightDate = dates[0] ? dates[0].date : '';
    minDist = Infinity;
    for (const d of dates) {
      const dist = Math.abs(d.pos - fn.pos);
      if (dist < minDist) { minDist = dist; flightDate = d.date; }
    }

    // Confidence
    const conf = {
      flightNumber: 15,
      bookingRef: bookingRef ? 20 : 0,
      depAirport: (route && route.from && AIRPORT_CODES.has(route.from.toUpperCase())) ? 10 : (route && route.from ? 5 : 0),
      arrAirport: (route && route.to && AIRPORT_CODES.has(route.to.toUpperCase())) ? 10 : (route && route.to ? 5 : 0),
      date: flightDate ? 15 : 0,
      passenger: passengerName ? 5 : 0,
      domain: AIRLINE_DOMAINS.some(function(d) { return emailFrom.includes(d); }) ? 10 : 0,
    };
    const confidence = Object.values(conf).reduce(function(a, b) { return a + b; }, 0);

    let flightNumber = fn.code + fn.num;
    if (fn.code === 'EZY' || fn.code === 'EJU') flightNumber = 'U2' + fn.num;

    flights.push({
      flightNumber: flightNumber,
      airlineCode: fn.code, // Keep original code for display
      flightNum: fn.num,    // Keep original number for display
      airline: fn.code.substring(0, 2),
      from: route ? route.from : '',
      to: route ? route.to : '',
      departureTime: flightDate,
      bookingRef: bookingRef,
      passengerName: passengerName,
      confidence: confidence,
      confidenceDetails: conf,
    });
  }

  return flights;
}

// ============================================================================
// TEST RUNNER
// ============================================================================

const EXPECTED = {
  '01-easyjet.html': { bookingRef: 'K5LN96D', flightNumber: 'U2 3847', from: 'LGW', to: 'BCN' },
  '02-ryanair.html': { bookingRef: 'ABC123', flightNumber: 'FR 7824' },
  '03-wizzair.html': { bookingRef: 'W9XY5Z', flightNumber: 'W6 2314' },
  '04-lufthansa.html': { method: 'json-ld' },
  '05-airfrance.html': { method: 'json-ld' },
  '06-pegasus.html': { bookingRef: 'PC8M4N', flightNumber: 'PC 1214', from: 'MXP', to: 'SAW' },
  '07-tripcom.html': { multipleFlights: true },
  '08-bookingcom.html': { flightNumber: 'IB 3125' },
  '09-yandex.html': { multipleFlights: true },
  '10-vueling.html': { bookingRef: 'VY3H7K', flightNumber: 'VY 8452' },
  // Tests 11-20
  '11-britishairways.html': { method: 'json-ld' },
  '12-turkish.html': { flightNumber: 'TK 1951' },
  '13-skyscanner.html': { multipleFlights: true },
  '14-expedia.html': { bookingRef: 'UA5K7M', flightNumber: 'UA 928', from: 'SFO', to: 'NRT' },
  '15-itaairways.html': { bookingRef: 'AZ3L9K', flightNumber: 'AZ 610', from: 'FCO', to: 'LIN' },
  '16-aviasales.html': { multipleFlights: true },
  '17-edreams.html': { bookingRef: 'I2M9K7', flightNumber: 'I2 3947', from: 'MAD', to: 'PMI' },
  '18-lot.html': { bookingRef: 'LO6M2K', flightNumber: 'LO 334', from: 'WAW', to: 'ORD' },
  '19-emirates.html': { bookingRef: 'EK9L3M', flightNumber: 'EK 001', from: 'DXB', to: 'LHR' },
  '20-kiwi.html': { multipleFlights: true },
};

const EMAIL_FROM = {
  '01-easyjet.html': 'booking@easyjet.com',
  '02-ryanair.html': 'noreply@ryanair.com',
  '03-wizzair.html': 'booking@wizzair.com',
  '04-lufthansa.html': 'booking@lufthansa.com',
  '05-airfrance.html': 'reservation@airfrance.fr',
  '06-pegasus.html': 'noreply@flypgs.com',
  '07-tripcom.html': 'noreply@trip.com',
  '08-bookingcom.html': 'noreply@booking.com',
  '09-yandex.html': 'noreply@travel.yandex.ru',
  '10-vueling.html': 'reservas@vueling.com',
};

console.log('\n🧪 FlightClaim Parser Test Suite\n');
console.log('='.repeat(70));

const testDir = path.join(__dirname, 'Genspark/testletters');
const files = fs.readdirSync(testDir).filter(function(f) { return f.endsWith('.html'); }).sort();

let passed = 0;
let failed = 0;

for (const file of files) {
  console.log('\n📧 ' + file);
  console.log('-'.repeat(70));

  const html = fs.readFileSync(path.join(testDir, file), 'utf8');
  const text = extractText(html);
  const emailFrom = EMAIL_FROM[file] || '';

  // Try JSON-LD first
  let flights = parseJsonLD(html);
  const method = flights.length > 0 ? 'json-ld' : 'regex';

  // Fallback to regex
  if (flights.length === 0) {
    flights = parseWithRegex(text, emailFrom);
  }

  const expected = EXPECTED[file];

  if (flights.length === 0) {
    console.log('   ❌ No flights found');
    failed++;
    continue;
  }

  const f = flights[0];
  // Use stored code and number for proper display
  const normalizedFlightNum = f.airlineCode ? (f.airlineCode + ' ' + f.flightNum) : f.flightNumber;

  console.log('   Method: ' + method);
  console.log('   Flights found: ' + flights.length);
  console.log('   Flight: ' + normalizedFlightNum);
  console.log('   Route: ' + f.from + ' → ' + f.to);
  console.log('   Date: ' + f.departureTime);
  console.log('   Booking: ' + f.bookingRef);
  console.log('   Passenger: ' + (f.passengerName || '-'));
  console.log('   Confidence: ' + f.confidence + '%');

  // Validate
  let isValid = true;
  const issues = [];

  if (expected) {
    if (expected.bookingRef && f.bookingRef !== expected.bookingRef) {
      issues.push('Booking: got "' + f.bookingRef + '", expected "' + expected.bookingRef + '"');
      isValid = false;
    }
    if (expected.flightNumber && normalizedFlightNum !== expected.flightNumber) {
      issues.push('Flight: got "' + normalizedFlightNum + '", expected "' + expected.flightNumber + '"');
      isValid = false;
    }
    if (expected.from && f.from.toUpperCase() !== expected.from) {
      issues.push('From: got "' + f.from + '", expected "' + expected.from + '"');
      isValid = false;
    }
    if (expected.to && f.to.toUpperCase() !== expected.to) {
      issues.push('To: got "' + f.to + '", expected "' + expected.to + '"');
      isValid = false;
    }
    if (expected.method && method !== expected.method) {
      issues.push('Method: expected "' + expected.method + '", got "' + method + '"');
      isValid = false;
    }
  }

  if (isValid) {
    console.log('   ✅ PASSED');
    passed++;
  } else {
    console.log('   ❌ FAILED');
    issues.forEach(function(i) { console.log('      • ' + i); });
    failed++;
  }
}

console.log('\n' + '='.repeat(70));
console.log('\n📊 Results: ' + passed + ' passed, ' + failed + ' failed out of ' + files.length);
console.log('   Success rate: ' + ((passed / files.length) * 100).toFixed(0) + '%\n');
