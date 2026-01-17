import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth';

// Airlines we're looking for
const AIRLINE_QUERIES = [
  'from:ryanair.com',
  'from:easyjet.com',
  'from:lufthansa.com',
  'from:wizzair.com',
  'from:vueling.com',
  'from:airbaltic.com',
  'from:klm.com',
  'from:airfrance.com',
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
];

// City names for route detection
const CITIES = 'Milan|Barcelona|Lisbon|London|Paris|Rome|Madrid|Berlin|Amsterdam|Dublin|Manchester|Bristol|Edinburgh|Glasgow|Naples|Venice|Porto|Malaga|Alicante|Faro|Nice|Lyon|Marseille|Munich|Frankfurt|Vienna|Prague|Budapest|Warsaw|Krakow|Riga|Tallinn|Vilnius|Stockholm|Copenhagen|Oslo|Helsinki|Luton|Gatwick|Stansted|Heathrow|Malpensa';
// Route pattern: "Milan-Barcelona" or "Milan to Barcelona" or "Milan → Barcelona"
const CITY_ROUTE_PATTERN = new RegExp(`(${CITIES})\\s*(?:to|→|-|–)\\s*(${CITIES})`, 'gi');

// Date patterns - prefer formats with year
const DATE_PATTERNS = [
  // "25-05-2024" or "25/05/2024" or "25.05.2024" (preferred - has year)
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
  // "2024-05-25"
  /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
  // "25 May 2024" or "25 May, 2024"
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,]?\s+(\d{4})/gi,
  // "May 25, 2024"
  /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})[,]?\s+(\d{4})/gi,
];

// Booking reference patterns - EasyJet uses 6-7 char codes like K7FJS1Z
const BOOKING_REF_PATTERNS = [
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

    const query = `(${AIRLINE_QUERIES.join(' OR ')}) after:${afterDate}`;

    console.log('Searching Gmail with query:', query);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} messages`);

    // Group by flight number (not booking ref) - each flight can have different delay
    const flightData: Map<string, FlightInfo> = new Map();

    // Get details for each message
    for (const msg of messages.slice(0, 30)) {
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

        // Extract flight number
        let flightNumber = '';
        for (const pattern of FLIGHT_PATTERNS) {
          pattern.lastIndex = 0;
          const match = pattern.exec(textToSearch);
          if (match) {
            flightNumber = `${match[1]}${match[2]}`.replace(/\s/g, '').toUpperCase();
            if (flightNumber.startsWith('EZY') || flightNumber.startsWith('EJU')) {
              flightNumber = 'U2' + flightNumber.slice(3);
            }
            break;
          }
        }

        // Skip if no flight number found
        if (!flightNumber) continue;

        // Extract flight date
        let flightDate = '';
        for (const pattern of DATE_PATTERNS) {
          pattern.lastIndex = 0;
          const match = pattern.exec(textToSearch);
          if (match) {
            flightDate = match[0];
            break;
          }
        }

        // Extract route - try multiple patterns
        let route = '';

        const cityList = 'Milan|Barcelona|Lisbon|London|Paris|Rome|Madrid|Berlin|Amsterdam|Malpensa|Dublin|Manchester|Luton|Gatwick|Stansted|Porto|Naples|Venice|Vienna|Prague|Budapest';

        // Debug: search for city names in body to see what format they appear in
        const milanIdx = bodyText.toLowerCase().indexOf('milan');
        const barcelonaIdx = bodyText.toLowerCase().indexOf('barcelona');
        if (milanIdx > 0 || barcelonaIdx > 0) {
          const startIdx = Math.max(0, Math.min(milanIdx > 0 ? milanIdx : 99999, barcelonaIdx > 0 ? barcelonaIdx : 99999) - 20);
          console.log(`City context for ${flightNumber}: "${bodyText.substring(startIdx, startIdx + 100).replace(/\s+/g, ' ')}"`);
        }

        // Pattern 1: "City-City, U2" format (EasyJet email header like "Milan-Barcelona, U2 3755")
        const cityDashU2Match = textToSearch.match(new RegExp(`(${cityList})\\s*[-–—]\\s*(${cityList})\\s*,\\s*U2`, 'i'));
        if (cityDashU2Match) {
          route = `${cityDashU2Match[1]} → ${cityDashU2Match[2]}`;
          console.log(`Route matched City-City, U2 format: ${route}`);
        }

        // Pattern 2: Generic "City-City" anywhere
        if (!route) {
          const cityDashMatch = textToSearch.match(new RegExp(`(${cityList})\\s*[-–—]\\s*(${cityList})`, 'i'));
          if (cityDashMatch) {
            route = `${cityDashMatch[1]} → ${cityDashMatch[2]}`;
            console.log(`Route matched City-City format: ${route}`);
          }
        }

        // Pattern 3: "from X to Y" in full text
        if (!route) {
          const fromToMatch = textToSearch.match(new RegExp(`from\\s+(${cityList})\\s+to\\s+(${cityList})`, 'i'));
          if (fromToMatch) {
            route = `${fromToMatch[1]} → ${fromToMatch[2]}`;
            console.log(`Route matched from-to format: ${route}`);
          }
        }

        // Pattern 4: "flight to [City]" - extract at least destination
        if (!route) {
          const flightToMatch = textToSearch.match(new RegExp(`(?:your\\s+)?flight\\s+to\\s+(${cityList})`, 'i'));
          if (flightToMatch) {
            route = `→ ${flightToMatch[1]}`;
            console.log(`Route matched destination only: ${route}`);
          }
        }

        console.log(`Flight ${flightNumber}: route="${route}", date="${flightDate}"`);

        // Group by flight number
        const existing = flightData.get(flightNumber);
        if (existing) {
          // Merge: fill in missing data
          if (bookingRef && existing.bookingRef === '-') {
            existing.bookingRef = bookingRef;
          }
          if (flightDate && existing.date === 'Check email') {
            existing.date = flightDate;
          }
          if (route && existing.route === 'Check email') {
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
      } catch (err) {
        console.error('Error fetching message:', err);
      }
    }

    // Convert map to array
    const flights = Array.from(flightData.values());

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
