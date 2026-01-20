import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// Search for delayed flights at a specific airport (more efficient - one call returns many flights)
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const airport = searchParams.get('airport') || 'BCN'; // Barcelona
  const hoursBack = parseInt(searchParams.get('hoursBack') || '12');

  const now = new Date();
  const fromTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

  // Format: YYYY-MM-DDTHH:mm
  const fromStr = fromTime.toISOString().slice(0, 16);
  const toStr = now.toISOString().slice(0, 16);

  try {
    // Get arrivals (easier to calculate delay since we compare scheduled vs actual arrival)
    const url = `https://${RAPIDAPI_HOST}/flights/airports/iata/${airport}/${fromStr}/${toStr}?direction=Arrival&withCancelled=false`;

    console.log(`Fetching arrivals at ${airport}: ${url}`);

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AeroDataBox error: ${response.status} - ${errorText}`);
      return NextResponse.json({
        error: `API error: ${response.status}`,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    const arrivals = data.arrivals || [];

    const delayedFlights: Array<{
      flightNumber: string;
      airline: string;
      date: string;
      route: string;
      scheduledArrival: string;
      actualArrival: string;
      delayMinutes: number;
    }> = [];

    for (const flight of arrivals) {
      const scheduledTime = flight.arrival?.scheduledTime?.utc;
      const actualTime = flight.arrival?.actualTime?.utc;

      if (!scheduledTime || !actualTime) continue;

      const scheduled = new Date(scheduledTime);
      const actual = new Date(actualTime);
      const delayMinutes = Math.floor((actual.getTime() - scheduled.getTime()) / 60000);

      // Only include significant delays (30+ minutes)
      if (delayMinutes >= 30) {
        delayedFlights.push({
          flightNumber: flight.number || 'Unknown',
          airline: flight.airline?.name || 'Unknown',
          date: scheduledTime.split('T')[0],
          route: `${flight.departure?.airport?.iata || '?'} → ${flight.arrival?.airport?.iata || airport}`,
          scheduledArrival: scheduledTime,
          actualArrival: actualTime,
          delayMinutes,
        });
      }
    }

    // Sort by delay descending
    delayedFlights.sort((a, b) => b.delayMinutes - a.delayMinutes);

    return NextResponse.json({
      airport,
      timeRange: `${fromStr} to ${toStr}`,
      totalFlightsChecked: arrivals.length,
      delayedFlights,
      bigDelays: delayedFlights.filter(f => f.delayMinutes >= 180), // 3+ hours for EU261
    });

  } catch (error) {
    console.error('Search airport delays error:', error);
    return NextResponse.json({ error: 'Failed to search delays' }, { status: 500 });
  }
}
