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
  iban: string;
  bookingReference: string;
}

// Map flight number prefix to airline email
const airlineEmails: Record<string, string> = {
  'FR': 'customerqueries@ryanair.com',
  'U2': 'customerservices@easyjet.com',
  'W6': 'info@wizzair.com',
  'W4': 'info@wizzair.com',
  'VY': 'customers@vueling.com',
  'LH': 'customer.relations@lufthansa.com',
  'AF': 'mail.customercare.france@airfrance.fr',
  'KL': 'klmcares@klm.com',
  'BA': 'customer.relations@ba.com',
  'IB': 'iberia@iberia.es',
  'AZ': 'support@ita-airways.com',
  'TP': 'customer@flytap.com',
  'SK': 'customer-relations@sas.se',
  'EI': 'customerrelations@aerlingus.com',
};

function getAirlineEmail(flightNumber: string): string {
  const prefix = flightNumber.substring(0, 2).toUpperCase();
  return airlineEmails[prefix] || 'customer.service@airline.com';
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: 'center' }}>Loading...</div>}>
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
    iban: '',
    bookingReference: searchParams.get('pnr') || '',
  });

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const airlineEmail = getAirlineEmail(flightNumber);

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
        throw new Error('PDF generation error');
      }

      const blob = await res.blob();
      setPdfBlob(blob);
      setShowSuccessModal(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfBlob) return;
    const url = window.URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claim-${flightNumber}-${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const delayHours = Math.floor(parseInt(delayMinutes) / 60);
  const delayMins = parseInt(delayMinutes) % 60;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo} onClick={() => router.push('/')}>FlightClaim</div>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>Compensation Claim Form</h1>

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
          Flight delay: <strong>{delayHours}h {delayMins}min</strong>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <h2 style={styles.sectionTitle}>Passenger Details</h2>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>First Name *</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="John"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Last Name *</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="Smith"
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
                placeholder="john.smith@example.com"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                style={styles.input}
                placeholder="+49 123 456 7890"
              />
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Address *</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              required
              style={{ ...styles.input, minHeight: 80 }}
              placeholder="123 Main Street, Berlin, 10115, Germany"
            />
          </div>

          <div style={styles.row}>
            <div style={styles.field}>
              <label style={styles.label}>Passport Number *</label>
              <input
                type="text"
                name="passportNumber"
                value={formData.passportNumber}
                onChange={handleChange}
                required
                style={styles.input}
                placeholder="AB1234567"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Booking Reference (PNR)</label>
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

          <h2 style={{ ...styles.sectionTitle, marginTop: 24 }}>Bank Details</h2>

          <div style={styles.field}>
            <label style={styles.label}>IBAN *</label>
            <input
              type="text"
              name="iban"
              value={formData.iban}
              onChange={handleChange}
              required
              style={styles.input}
              placeholder="DE89 3704 0044 0532 0130 00"
            />
            <span style={styles.fieldHint}>Your IBAN for receiving the compensation</span>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.submitBtn} disabled={generating}>
            {generating ? 'Generating PDF...' : 'Generate Claim (PDF)'}
          </button>
        </form>
      </main>

      {/* Success Modal */}
      {showSuccessModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalIcon}>✓</div>
            <h2 style={styles.modalTitle}>Claim Generated Successfully!</h2>
            <p style={styles.modalText}>
              Download your claim document and send it to the airline at:
            </p>
            <div style={styles.emailBox}>
              <strong>{airlineEmail}</strong>
            </div>
            <p style={styles.modalHint}>
              Attach your booking confirmation and boarding pass as evidence.
            </p>
            <button style={styles.downloadBtn} onClick={handleDownload}>
              Download Claim (PDF)
            </button>
            <button style={styles.closeBtn} onClick={() => setShowSuccessModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
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
  fieldHint: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
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
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: 16,
    padding: 32,
    maxWidth: 450,
    width: '90%',
    textAlign: 'center',
  },
  modalIcon: {
    width: 60,
    height: 60,
    background: '#10b981',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 32,
    margin: '0 auto 20px',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 600,
    marginBottom: 16,
  },
  modalText: {
    color: '#4b5563',
    marginBottom: 12,
  },
  emailBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    color: '#1e40af',
    fontSize: 15,
  },
  modalHint: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 24,
  },
  downloadBtn: {
    width: '100%',
    background: '#10b981',
    color: 'white',
    border: 'none',
    padding: '14px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    marginBottom: 12,
  },
  closeBtn: {
    width: '100%',
    background: 'transparent',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
    padding: '12px',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
};
