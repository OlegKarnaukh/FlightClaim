import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';
import OpenAI from 'openai';
import { authOptions } from '@/lib/auth';

// ============================================================================
// CONFIGURATION
// ============================================================================

const MAX_EMAILS_TO_PROCESS = 30; // Limit for cost control
const OPENAI_MODEL = 'gpt-4o-mini'; // Fast and cheap model for extraction

// Gmail search query to find flight-related emails
const GMAIL_QUERY = `(
  from:ryanair.com OR from:easyjet.com OR from:info.easyjet.com OR
  from:flypgs.com OR from:pegasus@flypgs.com OR
  from:lufthansa.com OR from:wizzair.com OR from:vueling.com OR
  from:turkishairlines.com OR from:thy.com OR
  from:qatarairways.com OR from:ethiopianairlines.com OR
  from:trip.com OR from:booking.com OR from:expedia.com OR
  subject:"flight confirmation" OR subject:"booking confirmation" OR
  subject:"e-ticket" OR subject:"itinerary" OR
  subject:"Бронирование авиабилета" OR subject:"электронный билет"
) after:2023/01/01`;

// ============================================================================
// TYPES
// ============================================================================

interface FlightInfo {
  id: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  from: string;
  fromCity: string;
  to: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  bookingRef: string;
  passengerName: string;
  subject: string;
  emailFrom: string;
  receivedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

interface LLMFlightData {
  is_flight_booking: boolean;
  flights: Array<{
    flight_number: string;
    airline: string;
    airline_code: string;
    departure_airport: string;
    departure_city: string;
    arrival_airport: string;
    arrival_city: string;
    departure_date: string;
    departure_time: string;
    booking_reference: string;
    passenger_name: string;
  }>;
}

// ============================================================================
// LLM EXTRACTION
// ============================================================================

async function extractFlightsWithLLM(
  openai: OpenAI,
  emailText: string,
  subject: string
): Promise<LLMFlightData | null> {
  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a flight booking data extractor. Analyze emails and extract flight information.

Rules:
- Only extract if this is a real flight booking/confirmation email
- Marketing, promotional, or status update emails without flight details should return is_flight_booking: false
- Extract ALL flights mentioned (outbound and return flights)
- Use IATA codes for airports when possible (e.g., MXP, FCO, LIS)
- Date format: YYYY-MM-DD
- Time format: HH:MM (24-hour)
- If data is not found, use empty string ""
- Booking reference is usually 6 alphanumeric characters (PNR)`,
        },
        {
          role: 'user',
          content: `Extract flight booking data from this email:

Subject: ${subject}

Email content:
${emailText.substring(0, 6000)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'flight_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              is_flight_booking: {
                type: 'boolean',
                description: 'True if this email contains actual flight booking information',
              },
              flights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    flight_number: { type: 'string', description: 'Flight number (e.g., FR5531, EJU3755)' },
                    airline: { type: 'string', description: 'Airline name' },
                    airline_code: { type: 'string', description: 'IATA airline code (e.g., FR, U2, PC)' },
                    departure_airport: { type: 'string', description: 'Departure airport IATA code' },
                    departure_city: { type: 'string', description: 'Departure city name' },
                    arrival_airport: { type: 'string', description: 'Arrival airport IATA code' },
                    arrival_city: { type: 'string', description: 'Arrival city name' },
                    departure_date: { type: 'string', description: 'Departure date (YYYY-MM-DD)' },
                    departure_time: { type: 'string', description: 'Departure time (HH:MM)' },
                    booking_reference: { type: 'string', description: 'Booking reference/PNR (6 chars)' },
                    passenger_name: { type: 'string', description: 'Passenger name' },
                  },
                  required: [
                    'flight_number', 'airline', 'airline_code',
                    'departure_airport', 'departure_city',
                    'arrival_airport', 'arrival_city',
                    'departure_date', 'departure_time',
                    'booking_reference', 'passenger_name',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['is_flight_booking', 'flights'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as LLMFlightData;
  } catch (error) {
    console.error('LLM extraction error:', error);
    return null;
  }
}

// ============================================================================
// EMAIL HELPERS
// ============================================================================

function extractBodyText(payload: any): string {
  if (!payload) return '';

  let text = '';

  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    text += payload.mimeType === 'text/html'
      ? decoded.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
      : decoded;
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8');
        text += html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      } else if (part.parts) {
        text += extractBodyText(part);
      }
    }
  }

  return text.trim();
}

function extractEmailDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : from;
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated or no Gmail access' },
        { status: 401 }
      );
    }

    // Check for OpenAI API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Search for flight-related emails
    console.log('Searching for flight emails...');
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: GMAIL_QUERY,
      maxResults: 100,
    });

    const messages = response.data.messages || [];
    console.log(`Found ${messages.length} potential flight emails`);

    // Process emails with LLM
    const flightMap = new Map<string, FlightInfo>();
    let processedCount = 0;

    for (const msg of messages.slice(0, MAX_EMAILS_TO_PROCESS)) {
      processedCount++;

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

        const bodyText = extractBodyText(detail.data.payload);

        if (!bodyText || bodyText.length < 100) {
          continue; // Skip empty or very short emails
        }

        console.log(`[${processedCount}/${MAX_EMAILS_TO_PROCESS}] Processing: ${subject.substring(0, 50)}...`);

        // Extract flights using LLM
        const extracted = await extractFlightsWithLLM(openai, bodyText, subject);

        if (!extracted?.is_flight_booking || !extracted.flights.length) {
          continue;
        }

        console.log(`  ✓ Found ${extracted.flights.length} flight(s)`);

        // Add flights to map (deduplicate by flight number + date)
        for (const flight of extracted.flights) {
          if (!flight.flight_number) continue;

          const key = `${flight.flight_number}_${flight.departure_date}`;

          // Skip if we already have this flight with better data
          const existing = flightMap.get(key);
          if (existing && existing.bookingRef && !flight.booking_reference) {
            continue;
          }

          flightMap.set(key, {
            id: msg.id!,
            flightNumber: flight.flight_number,
            airline: flight.airline,
            airlineCode: flight.airline_code,
            from: flight.departure_airport,
            fromCity: flight.departure_city,
            to: flight.arrival_airport,
            toCity: flight.arrival_city,
            departureDate: flight.departure_date,
            departureTime: flight.departure_time,
            bookingRef: flight.booking_reference || '-',
            passengerName: flight.passenger_name,
            subject: subject.substring(0, 80),
            emailFrom: extractEmailDomain(fromHeader),
            receivedAt: dateHeader,
            confidence: flight.booking_reference ? 'high' : 'medium',
          });

          console.log(`    → ${flight.flight_number}: ${flight.departure_city} → ${flight.arrival_city} (${flight.departure_date})`);
        }

      } catch (err) {
        console.error('Error processing message:', err);
      }
    }

    const flights = Array.from(flightMap.values());

    // Sort by departure date (newest first)
    flights.sort((a, b) => {
      if (!a.departureDate) return 1;
      if (!b.departureDate) return -1;
      return b.departureDate.localeCompare(a.departureDate);
    });

    console.log(`\nTotal unique flights found: ${flights.length}`);

    return NextResponse.json({
      success: true,
      totalEmailsFound: messages.length,
      emailsProcessed: processedCount,
      flightsFound: flights.length,
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
