'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface FlightInfo {
  id: string;
  flightNumber: string;
  airline: string;
  airlineCode: string;
  from: string;
  fromCity: string;
  to: string;
  toCity: string;
  departureDate: string;
  departureTime: string;
  bookingRef: string;
  passengerName: string;
  subject: string;
  emailFrom: string;
  receivedAt: string;
  confidence: 'high' | 'medium' | 'low';
}

interface ScanResult {
  success: boolean;
  totalEmailsFound: number;
  emailsProcessed: number;
  flightsFound: number;
  flights: FlightInfo[];
  error?: string;
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResult(null);

    try {
      const response = await fetch('/api/gmail/scan');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Scan failed');
      }

      setScanResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  if (status === 'loading') {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>Loading...</h1>
        </div>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>
          Scanning emails for <span style={styles.highlight}>{session.user?.email}</span>
        </p>

        {/* Scan Button */}
        {session.accessToken && !scanResult && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>🔍 Scan Your Emails</h2>
            <p style={styles.cardText}>
              We'll search for flight booking emails from the last 3 years.
            </p>
            <button
              style={{...styles.button, opacity: scanning ? 0.7 : 1}}
              onClick={handleScan}
              disabled={scanning}
            >
              {scanning ? '⏳ Scanning...' : '🚀 Start Scan'}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{...styles.card, background: 'rgba(239, 68, 68, 0.2)'}}>
            <h2 style={styles.cardTitle}>❌ Error</h2>
            <p style={styles.cardText}>{error}</p>
            <button style={styles.button} onClick={handleScan}>
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {scanResult && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>📊 Scan Results</h2>
              <div style={styles.infoRow}>
                <span>Emails found:</span>
                <span style={styles.highlight}>{scanResult.totalEmailsFound}</span>
              </div>
              <div style={styles.infoRow}>
                <span>Emails processed:</span>
                <span style={styles.highlight}>{scanResult.emailsProcessed}</span>
              </div>
              <div style={styles.infoRow}>
                <span>Flights detected:</span>
                <span style={styles.highlight}>{scanResult.flightsFound}</span>
              </div>
            </div>

            {scanResult.flights.length > 0 ? (
              <div style={styles.flightList}>
                <h2 style={{...styles.cardTitle, marginBottom: '20px'}}>✈️ Your Flights</h2>
                {scanResult.flights.map((flight, index) => (
                  <div key={`${flight.flightNumber}-${flight.departureDate}-${index}`} style={styles.flightCard}>
                    <div style={styles.flightHeader}>
                      <span style={styles.flightNumber}>{flight.flightNumber}</span>
                      <span style={styles.flightDate}>
                        {flight.departureDate} {flight.departureTime && `at ${flight.departureTime}`}
                      </span>
                    </div>
                    <div style={styles.flightRoute}>
                      🛫 {flight.fromCity || flight.from} → {flight.toCity || flight.to}
                    </div>
                    <div style={styles.flightInfo}>
                      <span>{getAirlineEmoji(flight.airlineCode)} {flight.airline}</span>
                      <span style={{
                        ...styles.bookingRef,
                        background: flight.confidence === 'high'
                          ? 'rgba(34, 197, 94, 0.3)'
                          : 'rgba(255, 215, 0, 0.2)'
                      }}>
                        Ref: {flight.bookingRef}
                      </span>
                    </div>
                    {flight.passengerName && (
                      <div style={styles.passengerName}>
                        👤 {flight.passengerName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.card}>
                <p style={styles.cardText}>
                  No flight bookings found in your emails. Try booking a flight first! ✈️
                </p>
              </div>
            )}

            <button
              style={{...styles.button, marginTop: '20px'}}
              onClick={() => setScanResult(null)}
            >
              🔄 Scan Again
            </button>
          </>
        )}

        <a href="/" style={styles.link}>
          ← Back to Home
        </a>
      </div>
    </main>
  );
}

function getAirlineEmoji(airlineCode: string): string {
  const emojis: Record<string, string> = {
    'FR': '🟡', // Ryanair
    'U2': '🟠', // EasyJet
    'EJU': '🟠', // EasyJet Europe
    'LH': '🔵', // Lufthansa
    'W6': '🟣', // Wizz Air
    'VY': '🟡', // Vueling
    'BT': '🟢', // airBaltic
    'KL': '🔵', // KLM
    'AF': '🔵', // Air France
    'PC': '🟣', // Pegasus
    'TK': '🔴', // Turkish Airlines
    'QR': '🟤', // Qatar Airways
    'ET': '🟢', // Ethiopian Airlines
  };
  return emojis[airlineCode] || '✈️';
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    minHeight: '100vh',
    padding: '40px 20px',
  },
  container: {
    color: 'white',
    maxWidth: '600px',
    width: '100%',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    marginBottom: '10px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '1.1rem',
    marginBottom: '30px',
    opacity: 0.9,
    textAlign: 'center',
  },
  highlight: {
    color: '#ffd700',
    fontWeight: 'bold',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '16px',
    padding: '25px',
    marginBottom: '20px',
    backdropFilter: 'blur(10px)',
  },
  cardTitle: {
    fontSize: '1.2rem',
    marginBottom: '15px',
    fontWeight: 'bold',
  },
  cardText: {
    fontSize: '1rem',
    marginBottom: '15px',
    opacity: 0.9,
    lineHeight: 1.5,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  button: {
    background: '#ffd700',
    color: '#333',
    border: 'none',
    padding: '15px 30px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    borderRadius: '50px',
    cursor: 'pointer',
    width: '100%',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    opacity: 0.7,
    display: 'block',
    textAlign: 'center',
    marginTop: '30px',
  },
  flightList: {
    marginBottom: '20px',
  },
  flightCard: {
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    padding: '15px 20px',
    marginBottom: '12px',
    borderLeft: '4px solid #ffd700',
  },
  flightHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  flightNumber: {
    fontSize: '1.3rem',
    fontWeight: 'bold',
    color: '#ffd700',
  },
  flightDate: {
    fontSize: '0.9rem',
    opacity: 0.8,
    background: 'rgba(255,255,255,0.1)',
    padding: '4px 10px',
    borderRadius: '12px',
  },
  flightRoute: {
    fontSize: '1.1rem',
    marginBottom: '8px',
    color: '#fff',
  },
  flightInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.9rem',
    opacity: 0.8,
  },
  bookingRef: {
    background: 'rgba(255,215,0,0.2)',
    padding: '3px 8px',
    borderRadius: '8px',
    fontSize: '0.85rem',
  },
  passengerName: {
    marginTop: '8px',
    fontSize: '0.85rem',
    opacity: 0.7,
  },
};
