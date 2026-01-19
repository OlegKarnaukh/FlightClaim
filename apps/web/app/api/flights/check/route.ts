import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// Normalize flight numbers (EJU/EZY → U2 for EasyJet, etc.)
function normalizeFlightNumber(flightNumber: string): string {
  const num = flightNumber.toUpperCase().replace(/\s+/g, '');

  // EasyJet uses U2, but often appears as EJU or EZY
  if (num.startsWith('EJU') || num.startsWith('EZY')) {
    return 'U2' + num.slice(3);
  }

  return num;
}

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
      return NextResponse.json({ error: 'Flight number and date required', status: 'ERROR' }, { status: 400 });
    }

    const normalizedFlight = normalizeFlightNumber(flightNumber);
    const dateStr = new Date(date).toISOString().split('T')[0];
    const url = `https://${RAPIDAPI_HOST}/flights/number/${normalizedFlight}/${dateStr}`;

    console.log(`Checking flight: ${normalizedFlight} on ${dateStr}`);

    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    console.log(`AeroDataBox response: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AeroDataBox API error: ${response.status} - ${errorText}`);
      return NextResponse.json({
        error: `Не удалось получить данные о рейсе (${response.status})`,
        status: 'ERROR'
      });
    }

    const data = await response.json();
    console.log(`AeroDataBox data:`, JSON.stringify(data).slice(0, 500));

    const flightData = Array.isArray(data) ? data[0] : data;

    if (!flightData) {
      return NextResponse.json({
        error: 'Рейс не найден в базе данных',
        status: 'ERROR'
      });
    }

    // Calculate delay
    const scheduledTime = flightData.arrival?.scheduledTime?.utc || flightData.arrival?.scheduledTimeUtc;
    const actualTime = flightData.arrival?.actualTime?.utc || flightData.arrival?.actualTimeUtc;

    if (!scheduledTime) {
      return NextResponse.json({
        error: 'Нет данных о времени прибытия',
        status: 'ERROR'
      });
    }

    const scheduled = new Date(scheduledTime);
    const actual = actualTime ? new Date(actualTime) : scheduled;
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
    return NextResponse.json({
      error: 'Ошибка при проверке рейса',
      status: 'ERROR'
    });
  }
}
