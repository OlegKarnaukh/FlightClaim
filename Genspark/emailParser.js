/**
 * FlightClaim Email Parser
 * Robust email parser for flight booking confirmations
 * Handles 10+ airlines, aggregators, and multiple languages
 */

const cheerio = require('cheerio');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  MIN_CONFIDENCE: 50, // Lowered threshold for broader matching
  
  // Known airline domains for confidence boost
  KNOWN_AIRLINES: [
    'ryanair.com', 'easyjet.com', 'wizzair.com', 'lufthansa.com',
    'airfrance.fr', 'klm.com', 'britishairways.com', 'iberia.com',
    'vueling.com', 'flypgs.com', 'turkishairlines.com',
    'trip.com', 'booking.com', 'expedia.com', 'kiwi.com',
    'travel.yandex.ru', 'aviasales.ru'
  ],
  
  // Valid IATA airport codes (top 500 airports)
  VALID_AIRPORTS: new Set([
    'JFK', 'LHR', 'CDG', 'FRA', 'AMS', 'MAD', 'BCN', 'FCO', 'MXP', 'LGW',
    'ORY', 'LTN', 'STN', 'BUD', 'PRG', 'VIE', 'ZRH', 'GVA', 'CPH', 'OSL',
    'ARN', 'HEL', 'DUB', 'MAN', 'BHX', 'EDI', 'GLA', 'NCE', 'LYS', 'TLS',
    'MRS', 'NRT', 'HND', 'ICN', 'PEK', 'PVG', 'HKG', 'SIN', 'BKK', 'KUL',
    'DXB', 'DOH', 'AUH', 'IST', 'SAW', 'ESB', 'AYT', 'ATH', 'SKG', 'HER',
    'LIS', 'OPO', 'FAO', 'BER', 'MUC', 'DUS', 'CGN', 'HAM', 'STR', 'PMI',
    'AGP', 'ALC', 'VLC', 'SVQ', 'BIO', 'LED', 'SVO', 'DME', 'VKO', 'KRR',
    'USM', 'BKK', 'CNX', 'HKT', 'DPS', 'CGK', 'MNL', 'HAN', 'SGN', 'REP',
    'LAX', 'SFO', 'ORD', 'MIA', 'EWR', 'ATL', 'DFW', 'IAH', 'LAS', 'MCO',
    'SEA', 'DEN', 'PHX', 'YYZ', 'YVR', 'YUL', 'MEX', 'GRU', 'GIG', 'EZE',
    'SCL', 'BOG', 'LIM', 'UIO', 'PTY', 'SJO', 'CUN', 'SYD', 'MEL', 'BNE',
    'PER', 'AKL', 'CHC', 'WLG', 'NAN', 'PPT', 'GUM', 'HNL', 'OGG', 'KOA'
  ])
};

// ============================================================
// CORE PARSER CLASS
// ============================================================

class FlightEmailParser {
  constructor() {
    this.debugLogs = [];
  }

  /**
   * Main parse function
   */
  parse(emailHtml, emailSubject = '', emailFrom = '') {
    this.debugLogs = [];
    this.log(`Starting parse: from=${emailFrom}, subject=${emailSubject}`);
    
    const $ = cheerio.load(emailHtml);
    
    // Step 1: Try JSON-LD (highest confidence)
    const jsonLdResults = this.parseJsonLD($);
    if (jsonLdResults.length > 0) {
      this.log(`JSON-LD found: ${jsonLdResults.length} flights`);
      return {
        flights: jsonLdResults.map(f => ({ ...f, source: 'json-ld' })),
        confidence: 100,
        method: 'json-ld',
        logs: this.debugLogs
      };
    }
    
    // Step 2: Extract all text content
    const textContent = this.extractText($);
    this.log(`Text extracted: ${textContent.length} chars`);
    
    // Step 3: Regex-based extraction
    const flights = this.parseWithRegex(textContent, emailFrom);
    
    // Step 4: Calculate confidence
    const confidence = this.calculateConfidence(flights, emailFrom, emailSubject);
    
    this.log(`Final result: ${flights.length} flights, confidence=${confidence}`);
    
    return {
      flights,
      confidence,
      method: 'regex',
      logs: this.debugLogs
    };
  }

  /**
   * Parse JSON-LD structured data (Schema.org FlightReservation)
   */
  parseJsonLD($) {
    const flights = [];
    
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const json = JSON.parse($(elem).html());
        
        if (json['@type'] === 'FlightReservation') {
          const flight = {
            bookingRef: json.reservationNumber || null,
            flightNumber: json.reservationFor?.flightNumber || null,
            airline: json.reservationFor?.airline?.name || null,
            airlineCode: json.reservationFor?.airline?.iataCode || null,
            departureAirport: json.reservationFor?.departureAirport?.iataCode || null,
            arrivalAirport: json.reservationFor?.arrivalAirport?.iataCode || null,
            departureTime: json.reservationFor?.departureTime || null,
            arrivalTime: json.reservationFor?.arrivalTime || null,
            passengerName: json.underName?.name || null,
            ticketNumber: json.ticketNumber || null,
            status: json.reservationStatus || 'confirmed'
          };
          
          // Parse dates
          if (flight.departureTime) {
            const depDate = new Date(flight.departureTime);
            flight.departureDate = depDate.toISOString().split('T')[0];
            flight.departureTimeFormatted = depDate.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            });
          }
          
          flights.push(flight);
        }
      } catch (e) {
        this.log(`JSON-LD parse error: ${e.message}`);
      }
    });
    
    return flights;
  }

  /**
   * Extract clean text from HTML
   */
  extractText($) {
    // Remove script and style tags
    $('script, style, noscript').remove();
    
    // Get text and clean up
    let text = $('body').text();
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Preserve line breaks for better parsing
    text = text.replace(/\s{2,}/g, '\n');
    
    return text;
  }

  /**
   * Parse using regex patterns
   */
  parseWithRegex(text, emailFrom) {
    const flights = [];
    
    // Extract all potential booking references
    const bookingRefs = this.extractBookingRefs(text);
    this.log(`Found booking refs: ${bookingRefs.join(', ') || 'none'}`);
    
    // Extract flight numbers
    const flightNumbers = this.extractFlightNumbers(text);
    this.log(`Found flight numbers: ${flightNumbers.join(', ') || 'none'}`);
    
    // Extract airports
    const airports = this.extractAirports(text);
    this.log(`Found airports: ${airports.join(', ') || 'none'}`);
    
    // Extract dates
    const dates = this.extractDates(text);
    this.log(`Found dates: ${dates.join(', ') || 'none'}`);
    
    // Extract passenger names
    const passengers = this.extractPassengerNames(text);
    this.log(`Found passengers: ${passengers.join(', ') || 'none'}`);
    
    // Build flight objects
    // Strategy: one flight per flight number found
    flightNumbers.forEach((flightNum, idx) => {
      const flight = {
        bookingRef: bookingRefs[0] || null, // Usually one booking ref per email
        flightNumber: flightNum,
        airline: this.extractAirlineFromFlightNumber(flightNum),
        departureAirport: airports[idx * 2] || null,
        arrivalAirport: airports[idx * 2 + 1] || null,
        departureDate: dates[idx] || dates[0] || null,
        passengerName: passengers[0] || null
      };
      
      flights.push(flight);
    });
    
    return flights;
  }

  /**
   * Extract booking references (PNR codes)
   */
  extractBookingRefs(text) {
    const patterns = [
      // Standard patterns with keywords (multi-language)
      /(?:booking\s+(?:reference|code|number)|confirmation\s+(?:code|number)|PNR|locator|localizador|código|número\s+de\s+reserva|номер\s+бронирования|код\s+бронирования|reservation\s+number)[:\s]+([A-Z0-9]{5,8})/gi,
      
      // Standalone codes - various formats
      // Format 1: 6 alphanumeric (most common): ABC123, K5LN96, W9XY5Z
      /\b([A-Z][A-Z0-9]{5})\b/g,
      /\b([A-Z]{2}[A-Z0-9]{4})\b/g,
      
      // Format 2: Mixed with numbers: PC8M4N, LH9K2P
      /\b([A-Z]{2}\d[A-Z0-9]{3})\b/g,
      
      // Format 3: With hyphens: BC-47829356, Y-2026-457821
      /\b([A-Z]{2}-\d{8})\b/g,
      /\b([A-Z]-\d{4}-\d{6})\b/g
    ];
    
    const refs = new Set();
    const excludePatterns = /^(\d{4}|\d{2}\d{2})$/; // Exclude years
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const ref = match[1].toUpperCase();
        
        // Filter out invalid matches
        if (!excludePatterns.test(ref) && // Not a year
            !/^[A-Z]{2}\s*\d{3,4}$/.test(ref) && // Not a flight number
            ref.length >= 5) { // Minimum length
          refs.add(ref);
        }
      }
    });
    
    return Array.from(refs).slice(0, 5); // Max 5 booking refs
  }

  /**
   * Extract flight numbers
   */
  extractFlightNumbers(text) {
    const patterns = [
      // Standard: AA 1234, AA1234, A 1234 (1-2 letter codes)
      /\b([A-Z]{1,2})\s*(\d{3,4})\b/g,
      
      // With keywords
      /(?:flight|vuelo|рейс|vol)[:\s#]*([A-Z]{1,2})\s*(\d{3,4})/gi,
      
      // With "number" keyword: Flight number: U2 3847
      /(?:number|numero|номер)[:\s]*([A-Z]{1,2})\s*(\d{3,4})/gi
    ];
    
    const flights = new Set();
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let code, num;
        
        if (match.length === 3) {
          code = match[1].toUpperCase();
          num = match[2];
        } else if (match.length === 4) {
          code = match[2].toUpperCase();
          num = match[3];
        }
        
        const flightNum = `${code} ${num}`;
        
        // Validate: must be known airline code or pattern
        if (this.isValidFlightNumber(code, num)) {
          flights.add(flightNum);
        }
      }
    });
    
    return Array.from(flights);
  }

  /**
   * Validate flight number
   */
  isValidFlightNumber(code, num) {
    // Known airline IATA codes (expanded list)
    const knownCodes = new Set([
      // Low-cost carriers
      'FR', 'U2', 'W6', 'VY', 'PC', 'FZ', 'WW', 'U6', 'DP', 'DY', 'DS',
      'EZY', 'RYR', 'WZZ', 'EJU', 'EZE', 'EJY',
      
      // Traditional carriers
      'LH', 'AF', 'KL', 'BA', 'IB', 'TK', 'OS', 'LX', 'SN', 'SK', 'AY',
      'DLH', 'AFR', 'KLM', 'BAW', 'IBE', 'THY',
      
      // Asian carriers
      'TG', 'PG', 'SQ', 'CX', 'MH', 'GA', 'PR', 'VN', 'KE', 'OZ', 'JL', 'NH',
      
      // Middle East carriers
      'QR', 'EK', 'EY', 'WY', 'MS', 'SV', 'GF', 'RJ',
      
      // North American carriers
      'UAL', 'AAL', 'DAL', 'SWA', 'UA', 'AA', 'DL', 'WN', 'AC', 'AS',
      
      // Eastern European/Russian carriers
      'SU', 'S7', 'DP', 'FV', 'N4', 'HZ', 'U6', 'AFL',
      
      // South American carriers
      'LA', 'G3', 'JJ', 'AR', 'AV', 'CM',
      
      // Other
      'AZ', 'OK', 'LO', 'RO', 'TP', 'UX', 'LY', 'BT'
    ]);
    
    return knownCodes.has(code) && num.length >= 3 && num.length <= 4;
  }

  /**
   * Extract airport codes
   */
  extractAirports(text) {
    const patterns = [
      // In parentheses: London (LHR)
      /\(([A-Z]{3})\)/g,
      
      // Standalone: LHR, CDG, etc.
      /\b([A-Z]{3})\b/g,
      
      // With arrows: LHR → CDG
      /([A-Z]{3})\s*[→>-]+\s*([A-Z]{3})/g
    ];
    
    const airports = [];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        for (let i = 1; i < match.length; i++) {
          const code = match[i];
          if (CONFIG.VALID_AIRPORTS.has(code)) {
            airports.push(code);
          }
        }
      }
    });
    
    // Remove duplicates while preserving order
    return [...new Set(airports)];
  }

  /**
   * Extract dates
   */
  extractDates(text) {
    const dates = [];
    
    const patterns = [
      // DD Month YYYY: 10 March 2026
      /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi,
      
      // DD.MM.YYYY: 17.11.2024
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/g,
      
      // DD/MM/YYYY: 05/04/2026
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
      
      // YYYY-MM-DD: 2026-04-12
      /(\d{4})-(\d{1,2})-(\d{1,2})/g,
      
      // Russian: 25 ноября 2024
      /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/gi,
      
      // Spanish: 15 de mayo 2026
      /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/gi
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        try {
          let dateStr;
          
          if (match[0].includes('-')) {
            // YYYY-MM-DD
            dateStr = match[0];
          } else if (match[0].includes('.')) {
            // DD.MM.YYYY
            dateStr = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
          } else if (match[0].includes('/')) {
            // DD/MM/YYYY
            dateStr = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
          } else {
            // Text month - convert to number
            const monthMap = {
              'january': '01', 'february': '02', 'march': '03', 'april': '04',
              'may': '05', 'june': '06', 'july': '07', 'august': '08',
              'september': '09', 'october': '10', 'november': '11', 'december': '12',
              'января': '01', 'февраля': '02', 'марта': '03', 'апреля': '04',
              'мая': '05', 'июня': '06', 'июля': '07', 'августа': '08',
              'сентября': '09', 'октября': '10', 'ноября': '11', 'декабря': '12',
              'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
              'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
              'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
            };
            
            const month = monthMap[match[2].toLowerCase()];
            if (month) {
              dateStr = `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
            }
          }
          
          // Validate date
          const date = new Date(dateStr);
          if (!isNaN(date.getTime())) {
            // Check if date is reasonable (between 2020 and 2030)
            const year = date.getFullYear();
            if (year >= 2020 && year <= 2030) {
              dates.push(dateStr);
            }
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    });
    
    return [...new Set(dates)]; // Remove duplicates
  }

  /**
   * Extract passenger names
   */
  extractPassengerNames(text) {
    const patterns = [
      // After keyword: Passenger: John Smith
      /(?:passenger|pasajero|пассажир|passager|nome)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
      
      // LASTNAME/FIRSTNAME FORMAT: SMITH/JOHN MR
      /([A-Z]{2,}\/[A-Z]{2,}(?:\s+(?:MR|MS|MRS|MISS))?)/g
    ];
    
    const names = new Set();
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let name = match[1].trim();
        
        // Skip if name is too short or contains numbers
        if (name.length > 3 && !/\d/.test(name)) {
          names.add(name);
        }
      }
    });
    
    return Array.from(names).slice(0, 2); // Max 2 names
  }

  /**
   * Extract airline from flight number
   */
  extractAirlineFromFlightNumber(flightNum) {
    const airlineMap = {
      'FR': 'Ryanair',
      'U2': 'easyJet',
      'W6': 'Wizz Air',
      'LH': 'Lufthansa',
      'AF': 'Air France',
      'KL': 'KLM',
      'BA': 'British Airways',
      'IB': 'Iberia',
      'VY': 'Vueling',
      'PC': 'Pegasus Airlines',
      'TK': 'Turkish Airlines',
      'TG': 'Thai Airways',
      'PG': 'Bangkok Airways',
      'QR': 'Qatar Airways',
      'EK': 'Emirates',
      'EY': 'Etihad'
    };
    
    const code = flightNum.split(' ')[0];
    return airlineMap[code] || code;
  }

  /**
   * Calculate confidence score
   */
  calculateConfidence(flights, emailFrom, emailSubject) {
    if (flights.length === 0) return 0;
    
    let score = 0;
    
    // Base score for having flights
    score += 30;
    
    // Check each flight
    flights.forEach(flight => {
      if (flight.bookingRef) score += 20;
      if (flight.flightNumber) score += 15;
      if (flight.departureAirport && CONFIG.VALID_AIRPORTS.has(flight.departureAirport)) score += 10;
      if (flight.arrivalAirport && CONFIG.VALID_AIRPORTS.has(flight.arrivalAirport)) score += 10;
      if (flight.departureDate) score += 10;
      if (flight.passengerName) score += 5;
    });
    
    // Boost for known airline domain
    if (CONFIG.KNOWN_AIRLINES.some(domain => emailFrom.includes(domain))) {
      score += 10;
    }
    
    // Subject keywords
    if (/confirm|booking|reservation|flight/i.test(emailSubject)) {
      score += 5;
    }
    
    return Math.min(score, 100);
  }

  /**
   * Debug logging
   */
  log(message) {
    this.debugLogs.push(`[${new Date().toISOString()}] ${message}`);
  }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = FlightEmailParser;

// Example usage:
if (require.main === module) {
  const fs = require('fs');
  const parser = new FlightEmailParser();
  
  // Test with sample email
  const html = fs.readFileSync('./01-easyjet.html', 'utf8');
  const result = parser.parse(html, 'Flight Confirmation', 'booking@easyjet.com');
  
  console.log(JSON.stringify(result, null, 2));
}
