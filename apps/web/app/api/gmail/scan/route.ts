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
  'from:booking@airbaltic.com',
  'from:klm.com',
  'from:airfrance.com',
];

// Flight number patterns for different airlines
const FLIGHT_PATTERNS = [
  /\b(FR|U2|LH|W6|VY|BT|KL|AF)\s?(\d{3,4})\b/gi,  // Standard IATA codes
  /flight[:\s]+([A-Z]{2})\s?(\d{3,4})/gi,          // "Flight: XX1234"
  /booking.*?([A-Z]{2})\s?(\d{3,4})/gi,            // "Booking...XX1234"
];

// Date patterns
const DATE_PATTERNS = [
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g,  // DD/MM/YYYY or DD-MM-YYYY
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})/gi,
];

interface FlightInfo {
  id: string;
  flightNumber: string;
  date: string;
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

    // Create OAuth2 client with access token
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

    // Get details for each message
    for (const msg of messages.slice(0, 20)) { // Limit to 20 for now
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const snippet = detail.data.snippet || '';

        // Try to extract flight number from subject or snippet
        let flightNumber = '';
        const textToSearch = `${subject} ${snippet}`;

        for (const pattern of FLIGHT_PATTERNS) {
          const match = pattern.exec(textToSearch);
          if (match) {
            flightNumber = `${match[1]}${match[2]}`.toUpperCase();
            break;
          }
          pattern.lastIndex = 0; // Reset regex
        }

        // Extract date from email
        let flightDate = '';
        for (const pattern of DATE_PATTERNS) {
          const match = pattern.exec(textToSearch);
          if (match) {
            flightDate = match[0];
            break;
          }
          pattern.lastIndex = 0;
        }

        flights.push({
          id: msg.id!,
          flightNumber: flightNumber || 'Unknown',
          date: flightDate || 'Check email',
          subject,
          from: extractEmailDomain(from),
          snippet: snippet.substring(0, 150) + '...',
          receivedAt: date,
        });
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

function extractEmailDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  if (match) {
    return match[1].toLowerCase();
  }
  return from;
}
