'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

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
  yearVisible: boolean;
  status: 'PENDING' | 'CHECKING' | 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'ERROR';
  delayMinutes: number | null;
  compensation: number | null;
  errorMessage?: string;
}

export default function Home() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [checking, setChecking] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Debug mode: add ?debug=240 to URL to simulate 240 min delay for testing
  const debugDelay = searchParams.get('debug') ? parseInt(searchParams.get('debug')!) : null;

  const processFile = async (file: File): Promise<Flight | null> => {
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

      const data = await res.json();
      return res.ok && data.flight ? data.flight : null;
    } catch {
      return null;
    }
  };

  const updateFlightDate = (id: string, newDate: string) => {
    setFlights(prev => prev.map(f => f.id === id ? { ...f, date: newDate, yearVisible: true } : f));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });

    const newFlights: Flight[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      const flight = await processFile(files[i]);
      if (flight) {
        newFlights.push(flight);
      }
      // Add small delay between uploads to avoid overloading the API
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (newFlights.length > 0) {
      setFlights(prev => [...newFlights, ...prev]);
    }

    if (newFlights.length < files.length) {
      alert(`Обработано ${newFlights.length} из ${files.length} файлов`);
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    e.target.value = '';
  };

  const checkFlight = async (id: string) => {
    const flight = flights.find(f => f.id === id);
    if (!flight) return;

    setChecking(id);
    setFlights(prev => prev.map(f => f.id === id ? { ...f, status: 'CHECKING' } : f));

    try {
      const res = await fetch('/api/flights/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flightNumber: flight.flightNumber,
          date: flight.date,
          ...(debugDelay && { debugDelay }),
        }),
      });

      const data = await res.json();

      setFlights(prev => prev.map(f => f.id === id ? {
        ...f,
        status: data.status || 'ERROR',
        delayMinutes: data.delayMinutes,
        compensation: data.compensation,
        departureCity: data.departureCity || f.departureCity,
        arrivalCity: data.arrivalCity || f.arrivalCity,
        errorMessage: data.error,
      } : f));
    } catch {
      setFlights(prev => prev.map(f => f.id === id ? { ...f, status: 'ERROR', errorMessage: 'Ошибка сети' } : f));
    } finally {
      setChecking(null);
    }
  };

  const checkAllFlights = async () => {
    const pendingFlights = flights.filter(f => f.status === 'PENDING');
    for (let i = 0; i < pendingFlights.length; i++) {
      await checkFlight(pendingFlights[i].id);
      // Add delay between requests to avoid rate limiting (429)
      if (i < pendingFlights.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  };

  const pendingCount = flights.filter(f => f.status === 'PENDING').length;

  return (
    <div style={styles.page}>
      {debugDelay && (
        <div style={styles.debugBanner}>
          🧪 Debug Mode: симуляция задержки {debugDelay} мин ({Math.floor(debugDelay / 60)}ч {debugDelay % 60}м)
        </div>
      )}
      <header style={styles.header}>
        <div style={styles.logo}>FlightClaim</div>
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
            {uploading
              ? `Обработка ${uploadProgress.current}/${uploadProgress.total}...`
              : 'Выберите файлы'}
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              multiple
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {flights.length > 0 && (
          <>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>Ваши рейсы</h2>
              {pendingCount > 0 && (
                <button
                  style={styles.checkAllBtn}
                  onClick={checkAllFlights}
                  disabled={!!checking}
                >
                  Проверить все ({pendingCount})
                </button>
              )}
            </div>
            <div style={styles.grid}>
              {flights.map((flight) => (
                <FlightCard
                  key={flight.id}
                  flight={flight}
                  onCheck={() => checkFlight(flight.id)}
                  onUpdateDate={(newDate) => updateFlightDate(flight.id, newDate)}
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
  onUpdateDate,
  isChecking,
}: {
  flight: Flight;
  onCheck: () => void;
  onUpdateDate: (newDate: string) => void;
  isChecking: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(flight.date);

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

  const handleSaveDate = () => {
    onUpdateDate(editDate);
    setEditing(false);
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
        {editing ? (
          <div style={styles.dateEditor}>
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              style={styles.dateInput}
            />
            <button onClick={handleSaveDate} style={styles.saveDateBtn}>OK</button>
            <button onClick={() => setEditing(false)} style={styles.cancelDateBtn}>✕</button>
          </div>
        ) : (
          <span
            onClick={() => flight.status === 'PENDING' && setEditing(true)}
            style={{ cursor: flight.status === 'PENDING' ? 'pointer' : 'default' }}
          >
            {formatDate(flight.date)}
            {flight.status === 'PENDING' && !flight.yearVisible && (
              <span style={styles.yearWarning}> ⚠️</span>
            )}
          </span>
        )}
        {flight.pnr && <span>PNR: <strong>{flight.pnr}</strong></span>}
      </div>

      {flight.status === 'PENDING' && !flight.yearVisible && !editing && (
        <div style={styles.yearWarningBox}>
          Год не виден на изображении. <button onClick={() => setEditing(true)} style={styles.editLink}>Проверьте дату</button>
        </div>
      )}

      {flight.status === 'PENDING' && (
        <button style={styles.checkBtn} onClick={onCheck} disabled={isChecking}>
          Проверить статус рейса
        </button>
      )}

      {flight.status === 'CHECKING' && (
        <button style={{ ...styles.checkBtn, opacity: 0.7 }} disabled>
          Проверка...
        </button>
      )}

      {flight.status === 'ELIGIBLE' && flight.delayMinutes !== null && (
        <div style={styles.successInfo}>
          Задержка: {Math.floor(flight.delayMinutes / 60)}ч {flight.delayMinutes % 60}мин — вы можете получить €{flight.compensation}!
        </div>
      )}

      {flight.status === 'NOT_ELIGIBLE' && (
        <div style={styles.noCompensation}>
          Рейс прибыл вовремя или задержка менее 3 часов
        </div>
      )}

      {flight.status === 'ERROR' && (
        <div>
          {flight.errorMessage && (
            <div style={styles.errorMessage}>{flight.errorMessage}</div>
          )}
          <button style={styles.checkBtn} onClick={onCheck}>
            Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
  },
  debugBanner: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '8px 16px',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 500,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'white',
    borderBottom: '1px solid #e5e7eb',
  },
  logo: {
    fontSize: 24,
    fontWeight: 700,
    color: '#2563eb',
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
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  checkAllBtn: {
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
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
  successInfo: {
    background: '#d1fae5',
    color: '#065f46',
    padding: '12px',
    borderRadius: 8,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: 500,
  },
  noCompensation: {
    background: '#f3f4f6',
    color: '#6b7280',
    padding: '12px',
    borderRadius: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  errorMessage: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 8,
    textAlign: 'center',
  },
  dateEditor: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dateInput: {
    padding: '4px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 4,
    fontSize: 13,
  },
  saveDateBtn: {
    padding: '4px 8px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  cancelDateBtn: {
    padding: '4px 8px',
    background: '#e5e7eb',
    color: '#374151',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
  },
  yearWarning: {
    color: '#f59e0b',
  },
  yearWarningBox: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  editLink: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
    fontSize: 12,
  },
};
