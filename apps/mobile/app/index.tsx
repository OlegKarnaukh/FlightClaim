import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function Home() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>FlightClaim</Text>
        <Text style={styles.subtitle}>
          Get up to <Text style={styles.highlight}>€600</Text> compensation for delayed flights
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How it works</Text>
          <Text style={styles.listItem}>1. Connect your Gmail account</Text>
          <Text style={styles.listItem}>2. We scan for flight bookings</Text>
          <Text style={styles.listItem}>3. Check which flights were delayed</Text>
          <Text style={styles.listItem}>4. Generate compensation claims</Text>
        </View>

        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Sign in with Google</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          EU261 Regulation • €19.99 per claim
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    marginBottom: 30,
    opacity: 0.9,
  },
  highlight: {
    color: '#ffd700',
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 25,
    marginBottom: 30,
    width: '100%',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 15,
  },
  listItem: {
    color: 'white',
    fontSize: 16,
    lineHeight: 28,
  },
  button: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 50,
    marginBottom: 20,
  },
  buttonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: 'bold',
  },
  footer: {
    color: 'white',
    opacity: 0.7,
    fontSize: 14,
  },
});
