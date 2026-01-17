'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

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
          Ready to scan emails for <span style={styles.highlight}>{session.user?.email}</span>
        </p>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Session Info</h2>
          <div style={styles.infoRow}>
            <span>Name:</span>
            <span>{session.user?.name}</span>
          </div>
          <div style={styles.infoRow}>
            <span>Email:</span>
            <span>{session.user?.email}</span>
          </div>
          <div style={styles.infoRow}>
            <span>Gmail Token:</span>
            <span style={{ color: session.accessToken ? '#4ade80' : '#f87171' }}>
              {session.accessToken ? '✅ Active' : '❌ Missing'}
            </span>
          </div>
        </div>

        {session.accessToken && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Next Step</h2>
            <p style={styles.cardText}>
              Gmail access granted! Now we can scan your emails for flight bookings.
            </p>
            <button style={styles.button} disabled>
              Scan Emails (Coming Soon)
            </button>
          </div>
        )}

        <a href="/" style={styles.link}>
          ← Back to Home
        </a>
      </div>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '20px',
  },
  container: {
    color: 'white',
    maxWidth: '500px',
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
    padding: '12px 30px',
    fontSize: '1rem',
    fontWeight: 'bold',
    borderRadius: '50px',
    cursor: 'pointer',
    width: '100%',
    opacity: 0.7,
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    opacity: 0.7,
    display: 'block',
    textAlign: 'center',
    marginTop: '20px',
  },
};
