import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Extract flight data using GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract flight information from this boarding pass or booking confirmation.

Return JSON only, no markdown:
{
  "flightNumber": "XX1234",
  "airline": "Airline Name",
  "departureAirport": "XXX",
  "arrivalAirport": "XXX",
  "departureCity": "Full City Name",
  "arrivalCity": "Full City Name",
  "date": "YYYY-MM-DD",
  "pnr": "ABC123",
  "yearVisible": false
}

CRITICAL for yearVisible:
- Set yearVisible to TRUE ONLY if you can see "2024" or "2025" or "2026" (4-digit year) written in the image
- Set yearVisible to FALSE if you see dates like "06 JUN", "06/06", "6 June", "06.06" without a 4-digit year
- Set yearVisible to FALSE if the year is abbreviated like "24" or "25" - this is ambiguous!
- When in doubt, set yearVisible to FALSE

If yearVisible is FALSE, still provide your best guess for the date but the user will verify it.

Other rules:
- Extract full city names, not just airport codes
- If any field is not found, use null`,
            },
            {
              type: 'image_url',
              image_url: { url: image },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Failed to extract data' }, { status: 500 });
    }

    const data = JSON.parse(content);

    if (!data.flightNumber || !data.date) {
      return NextResponse.json({ error: 'Could not extract flight number or date' }, { status: 400 });
    }

    return NextResponse.json({
      flight: {
        id: 'flight-' + Date.now(),
        flightNumber: data.flightNumber,
        airline: data.airline,
        departureAirport: data.departureAirport || 'N/A',
        arrivalAirport: data.arrivalAirport || 'N/A',
        departureCity: data.departureCity,
        arrivalCity: data.arrivalCity,
        date: data.date,
        pnr: data.pnr,
        yearVisible: data.yearVisible === true,
        status: 'PENDING',
        delayMinutes: null,
        compensation: null,
      },
    });
  } catch (error) {
    console.error('Extract error:', error);
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
  }
}
