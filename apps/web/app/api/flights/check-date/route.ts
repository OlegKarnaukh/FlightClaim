import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// Check a specific flight on a specific date
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const flight = searchParams.get('flight');
  const date = searchParams.get('date'); // Format: YYYY-MM-DD

  if (!flight || !date) {
    return NextResponse.json({
      error: 'Both flight and date parameters required',
      example: '/api/flights/check-date?flight=KL1009&date=2026-01-07'
    }, { status: 400 });
  }

  try {
    const url = `https://${RAPIDAPI_HOST}/flights/number/${flight}/${date}`;
    console.log(`Checking: ${url}`);

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `API error: ${response.status}`,
        details: errorText,
        flight,
        date
      }, { status: response.status });
    }

    const data = await response.json();
    const flightData = Array.isArray(data) ? data[0] : data;

    if (!flightData) {
      return NextResponse.json({ error: 'Flight not found', flight, date });
    }

    const scheduledTime = flightData.arrival?.scheduledTime?.utc;
    const actualTime = flightData.arrival?.actualTime?.utc;

    if (!scheduledTime) {
      return NextResponse.json({
        error: 'No scheduled time data',
        flight,
        date,
        rawData: flightData
      });
    }

    const scheduled = new Date(scheduledTime);
    const actual = actualTime ? new Date(actualTime) : null;
    const delayMinutes = actual
      ? Math.floor((actual.getTime() - scheduled.getTime()) / 60000)
      : null;

    // EU261 eligible if delay >= 180 minutes (3 hours)
    const eu261Eligible = delayMinutes !== null && delayMinutes >= 180;

    // Also check departure delay
    const scheduledDep = flightData.departure?.scheduledTime?.utc;
    const actualDep = flightData.departure?.actualTime?.utc;
    let depDelayMinutes: number | null = null;
    if (scheduledDep && actualDep) {
      depDelayMinutes = Math.floor(
        (new Date(actualDep).getTime() - new Date(scheduledDep).getTime()) / 60000
      );
    }

    return NextResponse.json({
      flight,
      date,
      airline: flightData.airline?.name,
      route: `${flightData.departure?.airport?.iata} → ${flightData.arrival?.airport?.iata}`,
      departureCity: flightData.departure?.airport?.name,
      arrivalCity: flightData.arrival?.airport?.name,
      scheduledDeparture: scheduledDep,
      actualDeparture: actualDep,
      departureDelayMinutes: depDelayMinutes,
      scheduledArrival: scheduledTime,
      actualArrival: actualTime,
      arrivalDelayMinutes: delayMinutes,
      delayFormatted: delayMinutes !== null
        ? `${Math.floor(delayMinutes / 60)}h ${delayMinutes % 60}m`
        : (depDelayMinutes !== null ? `dep: ${Math.floor(depDelayMinutes / 60)}h ${depDelayMinutes % 60}m` : 'N/A'),
      eu261Eligible: eu261Eligible || (depDelayMinutes !== null && depDelayMinutes >= 180),
      status: flightData.status,
      // Raw times for debugging
      rawTimes: {
        departure: flightData.departure?.scheduledTime,
        arrival: flightData.arrival?.scheduledTime,
        depActual: flightData.departure?.actualTime,
        arrActual: flightData.arrival?.actualTime,
      }
    });

  } catch (error) {
    console.error('Check date error:', error);
    return NextResponse.json({ error: 'Failed to check flight' }, { status: 500 });
  }
}
