export default function Home() {
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

        <button style={styles.button}>
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
  footer: {
    fontSize: '0.85rem',
    opacity: 0.7,
  },
};
