import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { image, fileDate } = await req.json();
    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Use file date to determine likely year range
    const fileYear = fileDate ? new Date(fileDate).getFullYear() : 2025;
    const yearHint = fileDate
      ? `The file was created on ${fileDate}. The flight date should be in ${fileYear - 1}, ${fileYear}, or ${fileYear + 1}.`
      : `The flight is likely from 2024 or 2025.`;

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
- If year is not visible, use the file creation date as reference
- NEVER use year 2026 - flights are from 2024 or 2025
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

    // Validate and fix year if needed
    let extractedDate = data.date;
    const extractedYear = parseInt(extractedDate.substring(0, 4));

    // If year is 2026 or later, adjust to file year or 2025
    if (extractedYear >= 2026) {
      const correctedYear = fileYear <= 2025 ? fileYear : 2025;
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
