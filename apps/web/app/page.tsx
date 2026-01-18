'use client';

import { signIn, signOut, useSession } from 'next-auth/react';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>FlightClaim</h1>
          <p style={styles.subtitle}>Loading...</p>
        </div>
      </main>
    );
  }

  if (session) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>FlightClaim</h1>
          <p style={styles.subtitle}>
            Welcome, <span style={styles.highlight}>{session.user?.name}</span>!
          </p>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Account Connected</h2>
            <p style={styles.cardText}>Email: {session.user?.email}</p>
            <p style={styles.cardText}>
              Gmail Access: {session.accessToken ? '✅ Granted' : '❌ Not granted'}
            </p>
          </div>

          <div style={styles.buttonGroup}>
            <a href="/dashboard" style={styles.buttonPrimary}>
              Scan My Emails
            </a>
            <button style={styles.buttonSecondary} onClick={() => signOut()}>
              Sign Out
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>FlightClaim</h1>
        <p style={styles.subtitle}>
          Get up to <span style={styles.highlight}>€600</span> compensation for delayed flights
        </p>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>How it works</h2>
          <ol style={styles.list}>
            <li>Connect your Gmail account</li>
            <li>We scan for flight bookings (last 3 years)</li>
            <li>Check which flights were delayed</li>
            <li>Generate and send compensation claims</li>
          </ol>
        </div>

        <button style={styles.button} onClick={() => signIn('google')}>
          Sign in with Google
        </button>

        <p style={styles.footer}>
          EU261 Regulation • €19.99 per claim • Keep 100% of your compensation
        </p>
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
    textAlign: 'center',
    color: 'white',
    maxWidth: '500px',
  },
  title: {
    fontSize: '3rem',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  subtitle: {
    fontSize: '1.3rem',
    marginBottom: '30px',
    opacity: 0.9,
  },
  highlight: {
    color: '#ffd700',
    fontWeight: 'bold',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '16px',
    padding: '25px',
    marginBottom: '30px',
    backdropFilter: 'blur(10px)',
  },
  cardTitle: {
    fontSize: '1.2rem',
    marginBottom: '15px',
  },
  cardText: {
    fontSize: '1rem',
    marginBottom: '8px',
    opacity: 0.9,
  },
  list: {
    textAlign: 'left',
    paddingLeft: '20px',
    lineHeight: '2',
  },
  button: {
    background: 'white',
    color: '#667eea',
    border: 'none',
    padding: '15px 40px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    borderRadius: '50px',
    cursor: 'pointer',
    marginBottom: '20px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    alignItems: 'center',
  },
  buttonPrimary: {
    background: '#ffd700',
    color: '#333',
    border: 'none',
    padding: '15px 40px',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    borderRadius: '50px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  buttonSecondary: {
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    border: '2px solid white',
    padding: '12px 30px',
    fontSize: '1rem',
    borderRadius: '50px',
    cursor: 'pointer',
  },
  footer: {
    fontSize: '0.85rem',
    opacity: 0.7,
  },
};
