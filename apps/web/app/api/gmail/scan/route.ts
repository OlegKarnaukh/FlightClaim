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

// Date patterns - more comprehensive
const DATE_PATTERNS = [
  // EasyJet format: "Thu 06 Jun" or "Sat 25 May" (day of week + date + month)
  /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi,
  // "25 May 2024" or "25 May, 2024"
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[,]?\s+(\d{4})/gi,
  // "May 25, 2024"
  /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})[,]?\s+(\d{4})/gi,
  // "25/05/2024" or "25-05-2024" or "25.05.2024"
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
  // "2024-05-25"
  /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,
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

    const flights: FlightInfo[] = [];
    const seenBookingRefs = new Set<string>();

    // Get details for each message - now with FULL body
    for (const msg of messages.slice(0, 30)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full', // Get full message including body
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const snippet = detail.data.snippet || '';

        // Extract body text
        const bodyText = extractBodyText(detail.data.payload);

        // Combine all text for searching
        const textToSearch = `${subject} ${snippet} ${bodyText}`;

        // Extract booking reference first
        let bookingRef = '';
        for (const pattern of BOOKING_REF_PATTERNS) {
          pattern.lastIndex = 0;
          const match = pattern.exec(textToSearch);
          if (match) {
            bookingRef = match[1].toUpperCase();
            break;
          }
        }

        // Skip if we've already seen this booking
        if (bookingRef && seenBookingRefs.has(bookingRef)) {
          continue;
        }
        if (bookingRef) {
          seenBookingRefs.add(bookingRef);
        }

        // Extract flight number
        let flightNumber = '';

        // Debug: log first 500 chars of text being searched
        console.log('=== Searching in text (first 500 chars) ===');
        console.log(textToSearch.substring(0, 500));
        console.log('=== Subject:', subject);

        for (const pattern of FLIGHT_PATTERNS) {
          pattern.lastIndex = 0;
          const match = pattern.exec(textToSearch);
          if (match) {
            console.log('Flight pattern matched:', pattern, 'Result:', match);
            // Normalize: remove spaces, uppercase
            flightNumber = `${match[1]}${match[2]}`.replace(/\s/g, '').toUpperCase();
            // Convert EZY/EJU to U2 for consistency
            if (flightNumber.startsWith('EZY') || flightNumber.startsWith('EJU')) {
              flightNumber = 'U2' + flightNumber.slice(3);
            }
            break;
          }
        }

        if (!flightNumber) {
          console.log('No flight number found in:', subject);
        }

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

        // Extract route (only use city names to avoid false positives)
        let route = '';
        CITY_ROUTE_PATTERN.lastIndex = 0;
        const cityMatch = CITY_ROUTE_PATTERN.exec(textToSearch);
        if (cityMatch) {
          route = `${cityMatch[1]} → ${cityMatch[2]}`;
        }

        // Only add if we found something useful
        if (flightNumber || bookingRef || route) {
          flights.push({
            id: msg.id!,
            flightNumber: flightNumber || 'Check email',
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
        // Strip HTML tags for searching
        const html = decodeBase64(part.body.data);
        text += html.replace(/<[^>]*>/g, ' ');
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
