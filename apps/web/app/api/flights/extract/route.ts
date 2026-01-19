import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image, fileDate } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Use file date only if it's from 2024 or 2025 (ignore 2026+ as it's likely just copy date)
    const fileYear = fileDate ? new Date(fileDate).getFullYear() : null;
    const isFileYearUseful = fileYear && fileYear >= 2024 && fileYear <= 2025;

    const yearHint = isFileYearUseful
      ? `The file was created on ${fileDate}. The flight is likely from ${fileYear}.`
      : `The flight is from 2024 or 2025. NEVER use 2026.`;

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

${yearHint}

Return JSON only, no markdown:
{
  "flightNumber": "XX1234",
  "airline": "Airline Name",
  "departureAirport": "XXX",
  "arrivalAirport": "XXX",
  "departureCity": "Full City Name",
  "arrivalCity": "Full City Name",
  "date": "YYYY-MM-DD",
  "pnr": "ABC123"
}

Important:
- For date, use full 4-digit year (YYYY-MM-DD format)
- Year MUST be 2024 or 2025. NEVER use 2026 or any future year.
- If year is not visible on the image, default to 2025
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

    // Validate and fix year - MUST be 2024 or 2025
    let extractedDate = data.date;
    const extractedYear = parseInt(extractedDate.substring(0, 4));

    // Force year to be 2024 or 2025
    if (extractedYear < 2024 || extractedYear > 2025) {
      // Default to 2025, or 2024 if file date suggests it
      const correctedYear = isFileYearUseful ? fileYear : 2025;
      extractedDate = correctedYear + extractedDate.substring(4);
      console.log(`Corrected year from ${extractedYear} to ${correctedYear}: ${extractedDate}`);
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
        date: extractedDate,
        pnr: data.pnr,
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
