import { NextRequest, NextResponse } from 'next/server';

const AVIATIONSTACK_KEY = process.env.AVIATIONSTACK_KEY;

// Check flight using Aviationstack API (has actual arrival times)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const flight = searchParams.get('flight');
  const date = searchParams.get('date'); // Format: YYYY-MM-DD

  if (!flight) {
    return NextResponse.json({
      error: 'Flight parameter required',
      example: '/api/flights/check-aviationstack?flight=LH123&date=2026-01-15'
    }, { status: 400 });
  }

  if (!AVIATIONSTACK_KEY) {
    return NextResponse.json({
      error: 'AVIATIONSTACK_KEY not configured'
    }, { status: 500 });
  }

  try {
    // Aviationstack historical flights endpoint
    // Free tier: only real-time flights. Historical requires paid plan.
    // Let's try the flights endpoint first
    const url = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_KEY}&flight_iata=${flight}`;

    console.log(`Checking Aviationstack: ${flight}`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: `API error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();

    if (data.error) {
      return NextResponse.json({
        error: data.error.message || 'API error',
        code: data.error.code
      }, { status: 400 });
    }

    const flights = data.data || [];

    if (flights.length === 0) {
      return NextResponse.json({
        error: 'No flight data found',
        flight,
        date
      });
    }

    // Find flight matching the date if provided
    let flightData = flights[0];
    if (date) {
      const targetDate = new Date(date).toISOString().split('T')[0];
      flightData = flights.find((f: any) =>
        f.flight_date === targetDate
      ) || flights[0];
    }

    // Calculate delay
    const scheduledArrival = flightData.arrival?.scheduled;
    const actualArrival = flightData.arrival?.actual;
    const estimatedArrival = flightData.arrival?.estimated;

    let delayMinutes: number | null = null;
    if (scheduledArrival && (actualArrival || estimatedArrival)) {
      const scheduled = new Date(scheduledArrival);
      const actual = new Date(actualArrival || estimatedArrival);
      delayMinutes = Math.floor((actual.getTime() - scheduled.getTime()) / 60000);
    }

    // Also use the delay field if available
    const arrivalDelay = flightData.arrival?.delay; // minutes

    const effectiveDelay = delayMinutes ?? arrivalDelay ?? null;
    const eu261Eligible = effectiveDelay !== null && effectiveDelay >= 180;

    return NextResponse.json({
      flight,
      date: flightData.flight_date,
      airline: flightData.airline?.name,
      flightNumber: flightData.flight?.iata,
      route: `${flightData.departure?.iata} → ${flightData.arrival?.iata}`,
      departureAirport: flightData.departure?.airport,
      arrivalAirport: flightData.arrival?.airport,

      departure: {
        scheduled: flightData.departure?.scheduled,
        actual: flightData.departure?.actual,
        estimated: flightData.departure?.estimated,
        delay: flightData.departure?.delay,
      },
      arrival: {
        scheduled: scheduledArrival,
        actual: actualArrival,
        estimated: estimatedArrival,
        delay: arrivalDelay,
      },

      delayMinutes: effectiveDelay,
      delayFormatted: effectiveDelay !== null
        ? `${Math.floor(Math.abs(effectiveDelay) / 60)}h ${Math.abs(effectiveDelay) % 60}m${effectiveDelay < 0 ? ' early' : ''}`
        : 'N/A',
      eu261Eligible,

      flightStatus: flightData.flight_status,
      live: flightData.live,
    });

  } catch (error) {
    console.error('Aviationstack error:', error);
    return NextResponse.json({ error: 'Failed to check flight' }, { status: 500 });
  }
}
