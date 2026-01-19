'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';

interface Flight {
  id: string;
  flightNumber: string;
  airline: string | null;
  departureAirport: string;
  arrivalAirport: string;
  departureCity: string | null;
  arrivalCity: string | null;
  date: string;
  pnr: string | null;
  status: 'PENDING' | 'CHECKING' | 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'ERROR';
  delayMinutes: number | null;
  compensation: number | null;
}

export default function Home() {
  const { data: session, status } = useSession();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);

  const loadFlights = useCallback(async () => {
    const res = await fetch('/api/flights');
    const data = await res.json();
    if (data.flights) setFlights(data.flights);
  }, []);

  useEffect(() => {
    if (session?.user) loadFlights();
  }, [session, loadFlights]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/flights/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });

      if (res.ok) {
        loadFlights();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to extract flight data');
      }
    } catch {
      alert('Failed to upload file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const checkFlight = async (id: string) => {
    setChecking(id);
    try {
      await fetch(`/api/flights/${id}/check`, { method: 'POST' });
      loadFlights();
    } finally {
      setChecking(null);
    }
  };

  if (status === 'loading') {
    return (
      <div style={styles.center}>
        <div style={styles.logo}>FlightClaim</div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.center}>
        <div style={styles.logo}>FlightClaim</div>
        <p style={styles.tagline}>
          Автоматическая проверка задержек рейсов и оформление компенсаций по EU261
        </p>
        <button style={styles.googleBtn} onClick={() => signIn('google')}>
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>FlightClaim</div>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{session.user?.name}</span>
          <button style={styles.signOutBtn} onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <p style={styles.tagline}>
          Автоматическая проверка задержек рейсов и оформление компенсаций по EU261
        </p>

        <div style={styles.infoBox}>
          Вы можете получить до <strong>€600</strong> компенсации за задержку, отмену или овербукинг рейса в ЕС.
          Загрузите подтверждение билета, и мы проверим ваше право на компенсацию.
        </div>

        <div style={styles.uploadCard}>
          <h3 style={styles.uploadTitle}>Загрузите подтверждение билета</h3>
          <p style={styles.uploadDesc}>
            Загрузите PDF, скриншот или фото подтверждения бронирования авиабилета
          </p>
          <label style={styles.uploadBtn}>
            {uploading ? 'Обработка...' : 'Выберите файл'}
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {flights.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>Ваши рейсы</h2>
            <div style={styles.grid}>
              {flights.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  onCheck={() => checkFlight(flight.id)}
                  isChecking={checking === flight.id}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FlightCard({
  flight,
  onCheck,
  isChecking,
}: {
  flight: Flight;
  onCheck: () => void;
  isChecking: boolean;
}) {
  const statusText: Record<string, string> = {
    PENDING: 'Требуется проверка',
    CHECKING: 'Проверка...',
    ELIGIBLE: `Компенсация €${flight.compensation}`,
    NOT_ELIGIBLE: 'Нет компенсации',
    ERROR: 'Ошибка проверки',
  };

  const statusColor: Record<string, string> = {
    PENDING: '#6b7280',
    CHECKING: '#f59e0b',
    ELIGIBLE: '#10b981',
    NOT_ELIGIBLE: '#6b7280',
    ERROR: '#ef4444',
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <div style={styles.flightNumber}>{flight.flightNumber}</div>
          {flight.airline && <div style={styles.airline}>{flight.airline}</div>}
        </div>
        <span style={{ ...styles.status, color: statusColor[flight.status] }}>
          {statusText[flight.status]}
        </span>
      </div>

      <div style={styles.route}>
        <div style={styles.airport}>
          <strong>{flight.departureAirport}</strong>
          {flight.departureCity && <div style={styles.city}>{flight.departureCity}</div>}
        </div>
        <span style={styles.arrow}>→</span>
        <div style={{ ...styles.airport, textAlign: 'right' }}>
          <strong>{flight.arrivalAirport}</strong>
          {flight.arrivalCity && <div style={styles.city}>{flight.arrivalCity}</div>}
        </div>
      </div>

      <div style={styles.meta}>
        <span>{formatDate(flight.date)}</span>
        {flight.pnr && <span>PNR: <strong>{flight.pnr}</strong></span>}
      </div>

      {flight.status === 'PENDING' && (
        <button
          style={styles.checkBtn}
          onClick={onCheck}
          disabled={isChecking}
        >
          {isChecking ? 'Проверка...' : 'Проверить статус рейса'}
        </button>
      )}

      {flight.status === 'ELIGIBLE' && flight.delayMinutes && (
        <div style={styles.delayInfo}>
          Задержка: {Math.floor(flight.delayMinutes / 60)}ч {flight.delayMinutes % 60}мин
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 20,
    textAlign: 'center',
  },
  page: {
    minHeight: '100vh',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    color: '#2563eb',
  },
  userName: {
    color: '#6b7280',
    fontSize: 14,
  },
  signOutBtn: {
    background: 'none',
    border: '1px solid #e5e7eb',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
  },
  main: {
    maxWidth: 900,
    margin: '0 auto',
    padding: 24,
  },
  tagline: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  infoBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    color: '#1e40af',
    fontSize: 14,
  },
  uploadCard: {
    background: 'white',
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
    border: '2px dashed #e5e7eb',
    marginBottom: 32,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 8,
  },
  uploadDesc: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 16,
  },
  uploadBtn: {
    display: 'inline-block',
    background: 'white',
    border: '1px solid #e5e7eb',
    padding: '12px 24px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 16,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  flightNumber: {
    fontSize: 18,
    fontWeight: 600,
  },
  airline: {
    fontSize: 13,
    color: '#6b7280',
  },
  status: {
    fontSize: 12,
    fontWeight: 500,
  },
  route: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  airport: {
    fontSize: 14,
  },
  city: {
    fontSize: 12,
    color: '#6b7280',
  },
  arrow: {
    color: '#9ca3af',
    fontSize: 18,
  },
  meta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  checkBtn: {
    width: '100%',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '12px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
  },
  delayInfo: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  googleBtn: {
    background: 'white',
    border: '1px solid #e5e7eb',
    padding: '12px 24px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 500,
    marginTop: 24,
  },
};
