import { NextRequest, NextResponse } from 'next/server';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// Search for delayed flights on specific routes
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const flight = searchParams.get('flight') || 'U23756'; // Default: Milan-Barcelona EasyJet
  const days = parseInt(searchParams.get('days') || '30'); // How many days to check

  const results: Array<{
    date: string;
    delayMinutes: number;
    scheduled: string;
    actual: string;
    route: string;
  }> = [];

  const today = new Date();

  for (let i = 1; i <= days; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];

    try {
      const url = `https://${RAPIDAPI_HOST}/flights/number/${flight}/${dateStr}`;

      const response = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': RAPIDAPI_KEY!,
          'X-RapidAPI-Host': RAPIDAPI_HOST,
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const flightData = Array.isArray(data) ? data[0] : data;

      if (!flightData) continue;

      const scheduledTime = flightData.arrival?.scheduledTime?.utc;
      const actualTime = flightData.arrival?.actualTime?.utc;

      if (!scheduledTime || !actualTime) continue;

      const scheduled = new Date(scheduledTime);
      const actual = new Date(actualTime);
      const delayMinutes = Math.floor((actual.getTime() - scheduled.getTime()) / 60000);

      if (delayMinutes >= 30) { // Only record delays of 30+ minutes
        results.push({
          date: dateStr,
          delayMinutes,
          scheduled: scheduledTime,
          actual: actualTime,
          route: `${flightData.departure?.airport?.iata} → ${flightData.arrival?.airport?.iata}`,
        });
      }

      // Rate limiting - wait 500ms between requests
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      console.error(`Error checking ${flight} on ${dateStr}:`, error);
    }
  }

  // Sort by delay descending
  results.sort((a, b) => b.delayMinutes - a.delayMinutes);

  return NextResponse.json({
    flight,
    daysChecked: days,
    delayedFlights: results,
    bigDelays: results.filter(r => r.delayMinutes >= 180), // 3+ hours
  });
}
