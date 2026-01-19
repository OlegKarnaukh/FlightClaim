import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// EU261 compensation calculation
function calculateCompensation(distanceKm: number, delayMinutes: number): { eligible: boolean; amount: number } {
  if (delayMinutes < 180) return { eligible: false, amount: 0 };

  if (distanceKm <= 1500) return { eligible: true, amount: 250 };
  if (distanceKm <= 3500) return { eligible: true, amount: 400 };
  return { eligible: true, amount: delayMinutes >= 240 ? 600 : 300 };
}

// Simple distance calculation using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(req: NextRequest) {
  try {
    const { flightNumber, date } = await req.json();

    if (!flightNumber || !date) {
      return NextResponse.json({ error: 'Flight number and date required' }, { status: 400 });
    }

    const dateStr = new Date(date).toISOString().split('T')[0];
    const url = `https://${RAPIDAPI_HOST}/flights/number/${flightNumber}/${dateStr}`;

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `AeroDataBox API error: ${response.status}`,
        status: 'ERROR'
      }, { status: 500 });
    }

    const data = await response.json();
    const flightData = Array.isArray(data) ? data[0] : data;

    if (!flightData) {
      return NextResponse.json({
        message: 'Flight not found in database',
        status: 'ERROR'
      });
    }

    // Calculate delay
    const scheduled = new Date(flightData.arrival?.scheduledTime?.utc || flightData.arrival?.scheduledTimeUtc);
    const actual = new Date(flightData.arrival?.actualTime?.utc || flightData.arrival?.actualTimeUtc || scheduled);
    const delayMinutes = Math.max(0, Math.floor((actual.getTime() - scheduled.getTime()) / 60000));

    // Get distance
    let distanceKm = flightData.greatCircleDistance?.km || 0;

    if (!distanceKm && flightData.departure?.airport?.location && flightData.arrival?.airport?.location) {
      const dep = flightData.departure.airport.location;
      const arr = flightData.arrival.airport.location;
      distanceKm = calculateDistance(dep.lat, dep.lon, arr.lat, arr.lon);
    }

    const { eligible, amount } = calculateCompensation(distanceKm, delayMinutes);

    return NextResponse.json({
      status: eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
      delayMinutes,
      compensation: amount,
      distanceKm: Math.round(distanceKm),
      departureCity: flightData.departure?.airport?.name,
      arrivalCity: flightData.arrival?.airport?.name,
    });
  } catch (error) {
    console.error('Check flight error:', error);
    return NextResponse.json({ error: 'Failed to check flight', status: 'ERROR' }, { status: 500 });
  }
}
