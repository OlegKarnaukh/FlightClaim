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
]);

const AIRPORT_CODES = new Set([
  'LHR', 'LGW', 'STN', 'LTN', 'MAN', 'DUB', 'FRA', 'MUC', 'BER', 'DUS',
  'FCO', 'MXP', 'BGY', 'VCE', 'NAP', 'MAD', 'BCN', 'PMI', 'AGP',
  'CDG', 'ORY', 'AMS', 'BRU', 'VIE', 'ZRH', 'PRG', 'BUD', 'WAW',
  'CPH', 'ARN', 'OSL', 'HEL', 'RIX', 'ATH', 'LIS', 'OPO',
  'IST', 'SAW', 'AYT', 'SVO', 'LED', 'DXB', 'DOH',
  'BKK', 'HKT', 'USM', 'SIN', 'NRT', 'JFK',
]);

const CITY_NAMES = 'London|Paris|Berlin|Rome|Milan|Madrid|Barcelona|Amsterdam|Frankfurt|Munich|Vienna|Prague|Budapest|Warsaw|Dublin|Brussels|Lisbon|Athens|Stockholm|Copenhagen|Istanbul|Moscow|Bangkok|Phuket|Singapore|Dubai|Gatwick|Stansted|Милан|Стамбул|Бангкок';

const PATTERNS = {
  bookingRef: [
    /(?:booking|confirmation|reservation|pnr|reference|бронирован|код\s*бронирования|booking\s*code)[:\s#]+([A-Z0-9]{5,8})\b/gi,
    /\b([A-Z][A-Z0-9]{5,6})\b/g,
  ],
  flightNumber: /\b(EZY|EJU|TG|PG|[A-Z]{2})\s?(\d{1,4})\b/g,
  airportRoute: /\b([A-Z]{3})\s*(?:to|→|->|-|–)\s*([A-Z]{3})\b/gi,
  date: [
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/gi,
    /(\d{1,2})\s+(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\.?\s+(\d{4})/gi,
  ],
  passengerName: [
    /(?:Dear|Уважаемый)\s+(?:Mr\.?|Ms\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /([A-Z]{2,}\/[A-Z]{2,}(?:\s+(?:MR|MS|MRS))?)/g,
    /(?:passenger|пассажир)[:\s]+([A-Z][A-Z\s]+)/gi,
  ],
};

const MONTH_TO_NUM = {
  'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
  'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
  'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'мая': '05', 'июн': '06',
  'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
  'нояб': '11',
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

function parseWithRegex(text, emailFrom) {
  emailFrom = emailFrom || '';
  const flights = [];

  // Find booking reference
  let bookingRef = '';
  for (const pattern of PATTERNS.bookingRef) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && match[1].length >= 6) {
      bookingRef = match[1].toUpperCase();
      break;
    }
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

  // Find routes - IATA
  const routes = [];
  PATTERNS.airportRoute.lastIndex = 0;
  while ((match = PATTERNS.airportRoute.exec(text)) !== null) {
    const from = match[1].toUpperCase();
    const to = match[2].toUpperCase();
    if (AIRPORT_CODES.has(from) && AIRPORT_CODES.has(to)) {
      routes.push({ from: from, to: to, pos: match.index });
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
      if (/[a-zа-я]/i.test(m0)) {
        const day = String(match[1]).padStart(2, '0');
        const monthStr = String(match[2]).toLowerCase();
        const month = MONTH_TO_NUM[monthStr] || MONTH_TO_NUM[monthStr.substring(0, 3)] || '01';
        const year = match[3] || '2026';
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
  const normalizedFlightNum = f.flightNumber.replace(/(\D+)(\d+)/, '$1 $2');

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
