import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// Simple distance calculation using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// EU261 compensation calculation
function calculateCompensation(distanceKm: number, delayMinutes: number): { eligible: boolean; amount: number } {
  if (delayMinutes < 180) return { eligible: false, amount: 0 };

  if (distanceKm <= 1500) return { eligible: true, amount: 250 };
  if (distanceKm <= 3500) return { eligible: true, amount: 400 };
  return { eligible: true, amount: delayMinutes >= 240 ? 600 : 300 };
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const flight = await prisma.flight.findFirst({
    where: { id: params.id, userId: session.user.id },
  });

  if (!flight) {
    return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
  }

  // Mark as checking
  await prisma.flight.update({
    where: { id: flight.id },
    data: { status: 'CHECKING' },
  });

  try {
    const dateStr = flight.date.toISOString().split('T')[0];
    const url = `https://${RAPIDAPI_HOST}/flights/number/${flight.flightNumber}/${dateStr}`;

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      throw new Error(`AeroDataBox API error: ${response.status}`);
    }

    const data = await response.json();
    const flightData = Array.isArray(data) ? data[0] : data;

    if (!flightData) {
      const updated = await prisma.flight.update({
        where: { id: flight.id },
        data: { status: 'ERROR' },
      });
      return NextResponse.json({ flight: updated, message: 'Flight not found in database' });
    }

    // Calculate delay
    const scheduled = new Date(flightData.arrival?.scheduledTime?.utc || flightData.arrival?.scheduledTimeUtc);
    const actual = new Date(flightData.arrival?.actualTime?.utc || flightData.arrival?.actualTimeUtc || scheduled);
    const delayMinutes = Math.max(0, Math.floor((actual.getTime() - scheduled.getTime()) / 60000));

    // Get distance from API or calculate
    let distanceKm = flightData.greatCircleDistance?.km || 0;

    if (!distanceKm && flightData.departure?.airport?.location && flightData.arrival?.airport?.location) {
      const dep = flightData.departure.airport.location;
      const arr = flightData.arrival.airport.location;
      distanceKm = calculateDistance(dep.lat, dep.lon, arr.lat, arr.lon);
    }

    const { eligible, amount } = calculateCompensation(distanceKm, delayMinutes);

    const updated = await prisma.flight.update({
      where: { id: flight.id },
      data: {
        status: eligible ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
        delayMinutes,
        compensation: amount,
        departureCity: flightData.departure?.airport?.name || flight.departureCity,
        arrivalCity: flightData.arrival?.airport?.name || flight.arrivalCity,
      },
    });

    return NextResponse.json({ flight: updated });
  } catch (error) {
    console.error('Check flight error:', error);
    const updated = await prisma.flight.update({
      where: { id: flight.id },
      data: { status: 'ERROR' },
    });
    return NextResponse.json({ flight: updated, error: 'Failed to check flight status' });
  }
}
