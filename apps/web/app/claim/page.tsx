'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface PassengerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  passportNumber: string;
  bookingReference: string;
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Загрузка...</div>}>
      <ClaimContent />
    </Suspense>
  );
}

function ClaimContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get flight data from URL params
  const flightNumber = searchParams.get('flight') || '';
  const date = searchParams.get('date') || '';
  const departureCity = searchParams.get('from') || '';
  const arrivalCity = searchParams.get('to') || '';
  const compensation = searchParams.get('amount') || '0';
  const delayMinutes = searchParams.get('delay') || '0';

  const [formData, setFormData] = useState<PassengerData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    passportNumber: '',
    bookingReference: searchParams.get('pnr') || '',
  });

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setGenerating(true);

    try {
      const res = await fetch('/api/claims/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passenger: formData,
          flight: {
            flightNumber,
            date,
            departureCity,
            arrivalCity,
            compensation: parseInt(compensation),
            delayMinutes: parseInt(delayMinutes),
          }
        }),
      });

      if (!res.ok) {
        throw new Error('Ошибка генерации PDF');
      }

      // Download PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claim-${flightNumber}-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const delayHours = Math.floor(parseInt(delayMinutes) / 60);
  const delayMins = parseInt(delayMinutes) % 60;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo} onClick={() => router.push('/')}>FlightClaim</div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>Оформление заявки на компенсацию</h1>

        <div style={styles.flightSummary}>
          <div style={styles.flightInfo}>
            <strong>{flightNumber}</strong>
            <span style={styles.route}>{departureCity} → {arrivalCity}</span>
            <span style={styles.date}>{formatDate(date)}</span>
          </div>
          <div style={styles.compensationBadge}>
            €{compensation}
          </div>
        </div>

        <div style={styles.delayInfo}>
          Задержка рейса: <strong>{delayHours}ч {delayMins}мин</strong>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.sectionTitle}>Данные пассажира</h2>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Имя *</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="Иван"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Фамилия *</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="Иванов"
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Email *</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="ivan@example.com"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Телефон</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                style={styles.input}
                placeholder="+7 999 123 4567"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Адрес проживания *</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              style={{ ...styles.input, minHeight: 80 }}
              placeholder="Город, улица, дом, квартира, индекс"
            />
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Номер паспорта *</label>
              <input
                type="text"
                name="passportNumber"
                value={formData.passportNumber}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="1234 567890"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Номер бронирования (PNR)</label>
              <input
                type="text"
                name="bookingReference"
                value={formData.bookingReference}
                onChange={handleChange}
                style={styles.input}
                placeholder="ABC123"
              />
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.submitBtn} disabled={generating}>
            {generating ? 'Генерация PDF...' : 'Сформировать претензию (PDF)'}
          </button>

          <p style={styles.hint}>
            После скачивания PDF отправьте претензию на email авиакомпании или через форму на их сайте.
          </p>
        </form>
      </main>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    background: '#f9fafb',
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
    cursor: 'pointer',
  },
  main: {
    maxWidth: 600,
    margin: '0 auto',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 24,
    textAlign: 'center',
  },
  flightSummary: {
    background: 'white',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    border: '1px solid #e5e7eb',
  },
  flightInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  route: {
    color: '#6b7280',
    fontSize: 14,
  },
  date: {
    color: '#6b7280',
    fontSize: 13,
  },
  compensationBadge: {
    background: '#10b981',
    color: 'white',
    padding: '12px 20px',
    borderRadius: 8,
    fontSize: 24,
    fontWeight: 700,
  },
  delayInfo: {
    background: '#fef3c7',
    color: '#92400e',
    padding: '12px 16px',
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 14,
  },
  form: {
    background: 'white',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: '1px solid #e5e7eb',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 6,
    color: '#374151',
  },
  input: {
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 15,
    width: '100%',
    boxSizing: 'border-box',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  submitBtn: {
    width: '100%',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '16px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 16,
  },
};
