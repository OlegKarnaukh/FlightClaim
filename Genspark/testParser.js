/**
 * Test Suite for Flight Email Parser
 * Run with: node testParser.js
 */

const fs = require('fs');
const path = require('path');
const FlightEmailParser = require('./emailParser');

// Test configuration
const TEST_EMAILS_DIR = './test-emails'; // Update this path
const EXPECTED_RESULTS = {
  '01-easyjet.html': {
    bookingRef: 'K5LN96D',
    flightNumber: 'U2 3847',
    route: 'LGW → BCN',
    date: '2026-03-10'
  },
  '02-ryanair.html': {
    bookingRef: 'ABC123',
    flightNumber: 'FR 7824',
    route: 'BER → FCO',
    date: '2026-03-25'
  },
  '03-wizzair.html': {
    bookingRef: 'W9XY5Z',
    flightNumber: 'W6 2314',
    route: 'BUD → LTN',
    date: '2026-04-05'
  },
  '04-lufthansa.html': {
    bookingRef: 'LH9K2P',
    flightNumber: 'LH 456',
    route: 'FRA → JFK',
    date: '2026-04-12',
    method: 'json-ld'
  },
  '05-airfrance.html': {
    bookingRef: 'AF2B7C',
    flightNumber: 'AF 1234',
    route: 'CDG → NRT',
    date: '2026-05-08',
    method: 'json-ld'
  },
  '06-pegasus.html': {
    bookingRef: 'PC8M4N',
    flightNumber: 'PC 1214',
    route: 'MXP → SAW',
    date: '2024-11-17'
  },
  '07-tripcom.html': {
    flights: 2, // Multi-leg flight
    bookingRefs: ['TG5L8P', 'PG9C2K'],
    flightNumbers: ['TG 417', 'PG 184']
  },
  '08-bookingcom.html': {
    bookingRef: 'BC-47829356',
    flightNumber: 'IB 3125',
    route: 'MAD → LIS',
    date: '2026-04-28'
  },
  '09-yandex.html': {
    flights: 2, // Round trip
    bookingRef: 'PC5N9K',
    flightNumbers: ['PC 397', 'PC 398']
  },
  '10-vueling.html': {
    bookingRef: 'VY3H7K',
    flightNumber: 'VY 8452',
    route: 'BCN → ORY',
    date: '2026-05-15'
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Test runner
async function runTests() {
  console.log(colorize('\n🧪 Flight Email Parser - Test Suite\n', 'cyan'));
  console.log('='.repeat(60));
  
  const parser = new FlightEmailParser();
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };
  
  // Get all test files
  const testFiles = Object.keys(EXPECTED_RESULTS);
  
  for (const filename of testFiles) {
    results.total++;
    
    console.log(colorize(`\n📧 Testing: ${filename}`, 'blue'));
    console.log('-'.repeat(60));
    
    try {
      // Read email HTML
      const filePath = path.join(__dirname, filename);
      
      if (!fs.existsSync(filePath)) {
        console.log(colorize(`   ⚠️  File not found: ${filePath}`, 'yellow'));
        console.log(colorize('   💡 Using files from current directory', 'yellow'));
      }
      
      const html = fs.readFileSync(filePath, 'utf8');
      const emailFrom = getEmailFrom(filename);
      const subject = 'Flight Confirmation';
      
      // Parse email
      const result = parser.parse(html, subject, emailFrom);
      
      // Validate result
      const expected = EXPECTED_RESULTS[filename];
      const validation = validateResult(result, expected, filename);
      
      if (validation.passed) {
        results.passed++;
        console.log(colorize('   ✅ PASSED', 'green'));
      } else {
        results.failed++;
        console.log(colorize('   ❌ FAILED', 'red'));
      }
      
      // Display details
      console.log(colorize('\n   Results:', 'cyan'));
      console.log(`   • Flights found: ${result.flights.length}`);
      console.log(`   • Confidence: ${result.confidence}%`);
      console.log(`   • Method: ${result.method}`);
      
      if (result.flights.length > 0) {
        result.flights.forEach((flight, idx) => {
          console.log(colorize(`\n   Flight ${idx + 1}:`, 'yellow'));
          console.log(`   • Booking: ${flight.bookingRef || 'N/A'}`);
          console.log(`   • Flight: ${flight.flightNumber || 'N/A'}`);
          console.log(`   • Route: ${flight.departureAirport || '?'} → ${flight.arrivalAirport || '?'}`);
          console.log(`   • Date: ${flight.departureDate || 'N/A'}`);
          console.log(`   • Passenger: ${flight.passengerName || 'N/A'}`);
        });
      }
      
      // Show validation issues
      if (validation.issues.length > 0) {
        console.log(colorize('\n   Issues:', 'red'));
        validation.issues.forEach(issue => {
          console.log(`   • ${issue}`);
        });
      }
      
      // Show debug logs if failed
      if (!validation.passed && result.logs) {
        console.log(colorize('\n   Debug Logs:', 'yellow'));
        result.logs.slice(-5).forEach(log => {
          console.log(`   ${log}`);
        });
      }
      
      results.details.push({
        filename,
        passed: validation.passed,
        result,
        issues: validation.issues
      });
      
    } catch (error) {
      results.failed++;
      console.log(colorize(`   ❌ ERROR: ${error.message}`, 'red'));
      results.details.push({
        filename,
        passed: false,
        error: error.message
      });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(colorize('\n📊 Test Summary\n', 'cyan'));
  console.log(`Total tests: ${results.total}`);
  console.log(colorize(`Passed: ${results.passed}`, 'green'));
  console.log(colorize(`Failed: ${results.failed}`, 'red'));
  console.log(`Success rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  // Recommendations
  if (results.failed > 0) {
    console.log(colorize('\n💡 Recommendations:', 'yellow'));
    const commonIssues = analyzeCommonIssues(results.details);
    commonIssues.forEach(issue => {
      console.log(`   • ${issue}`);
    });
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Helper: Get email from for each file
function getEmailFrom(filename) {
  const map = {
    '01-easyjet.html': 'booking@easyjet.com',
    '02-ryanair.html': 'noreply@ryanair.com',
    '03-wizzair.html': 'booking@wizzair.com',
    '04-lufthansa.html': 'booking@lufthansa.com',
    '05-airfrance.html': 'reservation@airfrance.fr',
    '06-pegasus.html': 'noreply@flypgs.com',
    '07-tripcom.html': 'noreply@trip.com',
    '08-bookingcom.html': 'noreply@booking.com',
    '09-yandex.html': 'noreply@travel.yandex.ru',
    '10-vueling.html': 'reservas@vueling.com'
  };
  return map[filename] || 'unknown@airline.com';
}

// Validate parsing result against expected
function validateResult(result, expected, filename) {
  const issues = [];
  let passed = true;
  
  // Check minimum confidence
  if (result.confidence < 50) {
    issues.push(`Low confidence: ${result.confidence}% (expected ≥ 50%)`);
    passed = false;
  }
  
  // Check flights found
  if (result.flights.length === 0) {
    issues.push('No flights found');
    passed = false;
    return { passed, issues };
  }
  
  const flight = result.flights[0];
  
  // Validate specific fields
  if (expected.bookingRef && flight.bookingRef !== expected.bookingRef) {
    issues.push(`Booking ref mismatch: got "${flight.bookingRef}", expected "${expected.bookingRef}"`);
    passed = false;
  }
  
  if (expected.flightNumber && flight.flightNumber !== expected.flightNumber) {
    issues.push(`Flight number mismatch: got "${flight.flightNumber}", expected "${expected.flightNumber}"`);
    passed = false;
  }
  
  if (expected.date && flight.departureDate !== expected.date) {
    issues.push(`Date mismatch: got "${flight.departureDate}", expected "${expected.date}"`);
    passed = false;
  }
  
  // Check method for JSON-LD emails
  if (expected.method === 'json-ld' && result.method !== 'json-ld') {
    issues.push(`Expected JSON-LD parsing, got ${result.method}`);
    passed = false;
  }
  
  // Multi-flight validation
  if (expected.flights && result.flights.length !== expected.flights) {
    issues.push(`Flight count mismatch: got ${result.flights.length}, expected ${expected.flights}`);
    passed = false;
  }
  
  return { passed, issues };
}

// Analyze common issues across failed tests
function analyzeCommonIssues(details) {
  const recommendations = [];
  const failedTests = details.filter(d => !d.passed);
  
  if (failedTests.length === 0) return recommendations;
  
  // Count issue types
  const issueTypes = {
    confidence: 0,
    bookingRef: 0,
    flightNumber: 0,
    date: 0,
    noFlights: 0
  };
  
  failedTests.forEach(test => {
    if (test.issues) {
      test.issues.forEach(issue => {
        if (issue.includes('confidence')) issueTypes.confidence++;
        if (issue.includes('Booking ref')) issueTypes.bookingRef++;
        if (issue.includes('Flight number')) issueTypes.flightNumber++;
        if (issue.includes('Date')) issueTypes.date++;
        if (issue.includes('No flights')) issueTypes.noFlights++;
      });
    }
  });
  
  // Generate recommendations
  if (issueTypes.noFlights > 2) {
    recommendations.push('Multiple emails not parsed - check regex patterns');
  }
  if (issueTypes.bookingRef > 2) {
    recommendations.push('Booking reference extraction needs improvement');
  }
  if (issueTypes.date > 2) {
    recommendations.push('Date parsing needs additional formats');
  }
  if (issueTypes.confidence > 2) {
    recommendations.push('Consider lowering confidence threshold');
  }
  
  return recommendations;
}

// Run tests
runTests().catch(console.error);
