import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface EscalationData {
  // Passenger
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: string;
  // Flight
  flightNumber: string;
  flightDate: string;
  departureCity: string;
  arrivalCity: string;
  departureAirport: string; // IATA code
  airline: string;
  airlineEmail: string;
  delayMinutes: number;
  compensation: number;
  // Claim history
  claimSentDate: string;
  followUpDate?: string;
  airlineResponse?: string;
}

// National Aviation Authorities database
// Based on departure airport country (IATA code prefix patterns)
interface AuthorityInfo {
  name: string;
  fullName: string;
  email: string;
  website: string;
  address: string;
  country: string;
}

const nationalAuthorities: Record<string, AuthorityInfo> = {
  // Germany
  'DE': {
    name: 'LBA',
    fullName: 'Luftfahrt-Bundesamt',
    email: 'fluggastrechte@lba.de',
    website: 'https://www.lba.de',
    address: 'Luftfahrt-Bundesamt, 38144 Braunschweig, Germany',
    country: 'Germany',
  },
  // United Kingdom
  'GB': {
    name: 'CAA',
    fullName: 'Civil Aviation Authority',
    email: 'passenger.complaints@caa.co.uk',
    website: 'https://www.caa.co.uk',
    address: 'CAA House, 45-59 Kingsway, London WC2B 6TE, UK',
    country: 'United Kingdom',
  },
  // France
  'FR': {
    name: 'DGAC',
    fullName: 'Direction Générale de l\'Aviation Civile',
    email: 'passagers-aeriens@aviation-civile.gouv.fr',
    website: 'https://www.ecologie.gouv.fr/direction-generale-laviation-civile-dgac',
    address: '50 rue Henry Farman, 75720 Paris Cedex 15, France',
    country: 'France',
  },
  // Spain
  'ES': {
    name: 'AESA',
    fullName: 'Agencia Estatal de Seguridad Aérea',
    email: 'sau.aesa@seguridadaerea.es',
    website: 'https://www.seguridadaerea.gob.es',
    address: 'Avenida General Perón 40, 28020 Madrid, Spain',
    country: 'Spain',
  },
  // Italy
  'IT': {
    name: 'ENAC',
    fullName: 'Ente Nazionale per l\'Aviazione Civile',
    email: 'cartadiritti@enac.gov.it',
    website: 'https://www.enac.gov.it',
    address: 'Viale del Castro Pretorio 118, 00185 Roma, Italy',
    country: 'Italy',
  },
  // Netherlands
  'NL': {
    name: 'ILT',
    fullName: 'Inspectie Leefomgeving en Transport',
    email: 'passagiersrechten@ilent.nl',
    website: 'https://www.ilent.nl',
    address: 'Postbus 16191, 2500 BD Den Haag, Netherlands',
    country: 'Netherlands',
  },
  // Belgium
  'BE': {
    name: 'SPF Mobilité',
    fullName: 'Service Public Fédéral Mobilité et Transports',
    email: 'passenger.rights@mobilit.fgov.be',
    website: 'https://mobilit.belgium.be',
    address: 'Rue du Progrès 56, 1210 Brussels, Belgium',
    country: 'Belgium',
  },
  // Austria
  'AT': {
    name: 'APF',
    fullName: 'Agentur für Passagier- und Fahrgastrechte',
    email: 'post@apf.gv.at',
    website: 'https://www.apf.gv.at',
    address: 'Linke Wienzeile 4/1/6, 1060 Vienna, Austria',
    country: 'Austria',
  },
  // Portugal
  'PT': {
    name: 'ANAC',
    fullName: 'Autoridade Nacional da Aviação Civil',
    email: 'passageiros@anac.pt',
    website: 'https://www.anac.pt',
    address: 'Rua B, Edifício 4, Aeroporto de Lisboa, 1749-034 Lisboa, Portugal',
    country: 'Portugal',
  },
  // Poland
  'PL': {
    name: 'ULC',
    fullName: 'Urząd Lotnictwa Cywilnego',
    email: 'pasazerowie@ulc.gov.pl',
    website: 'https://www.ulc.gov.pl',
    address: 'ul. Marcina Flisa 2, 02-247 Warszawa, Poland',
    country: 'Poland',
  },
  // Ireland
  'IE': {
    name: 'CAR',
    fullName: 'Commission for Aviation Regulation',
    email: 'info@aviationreg.ie',
    website: 'https://www.aviationreg.ie',
    address: '3rd Floor, Alexandra House, Earlsfort Terrace, Dublin 2, Ireland',
    country: 'Ireland',
  },
  // Greece
  'GR': {
    name: 'HCAA',
    fullName: 'Hellenic Civil Aviation Authority',
    email: 'dak-b@hcaa.gr',
    website: 'https://www.ypa.gr',
    address: 'Vas. Georgiou 1, 16604 Elliniko, Greece',
    country: 'Greece',
  },
  // Sweden
  'SE': {
    name: 'Konsumentverket',
    fullName: 'Swedish Consumer Agency',
    email: 'konsumentverket@konsumentverket.se',
    website: 'https://www.konsumentverket.se',
    address: 'Box 48, 651 02 Karlstad, Sweden',
    country: 'Sweden',
  },
  // Denmark
  'DK': {
    name: 'Trafikstyrelsen',
    fullName: 'Danish Transport Authority',
    email: 'info@trafikstyrelsen.dk',
    website: 'https://www.trafikstyrelsen.dk',
    address: 'Carsten Niebuhrs Gade 43, 1577 Copenhagen, Denmark',
    country: 'Denmark',
  },
  // Finland
  'FI': {
    name: 'Traficom',
    fullName: 'Finnish Transport and Communications Agency',
    email: 'kirjaamo@traficom.fi',
    website: 'https://www.traficom.fi',
    address: 'PO Box 320, 00059 Traficom, Finland',
    country: 'Finland',
  },
  // Czech Republic
  'CZ': {
    name: 'CAA CZ',
    fullName: 'Civil Aviation Authority Czech Republic',
    email: 'podatelna@caa.cz',
    website: 'https://www.caa.cz',
    address: 'K letišti 1040/10, 160 08 Praha 6, Czech Republic',
    country: 'Czech Republic',
  },
  // Hungary
  'HU': {
    name: 'HungaroControl',
    fullName: 'Közlekedési Hatóság',
    email: 'ugyfelszolgalat@nkh.gov.hu',
    website: 'https://www.nkh.gov.hu',
    address: 'Szerémi út 4, 1117 Budapest, Hungary',
    country: 'Hungary',
  },
};

// Map airport codes to countries
const airportCountryMap: Record<string, string> = {
  // Germany
  'FRA': 'DE', 'MUC': 'DE', 'BER': 'DE', 'DUS': 'DE', 'HAM': 'DE', 'CGN': 'DE', 'STR': 'DE', 'TXL': 'DE', 'SXF': 'DE', 'HAJ': 'DE', 'NUE': 'DE', 'LEJ': 'DE', 'DTM': 'DE', 'FMO': 'DE', 'PAD': 'DE', 'NRN': 'DE', 'HHN': 'DE',
  // UK
  'LHR': 'GB', 'LGW': 'GB', 'STN': 'GB', 'LTN': 'GB', 'MAN': 'GB', 'BHX': 'GB', 'EDI': 'GB', 'GLA': 'GB', 'BRS': 'GB', 'LPL': 'GB', 'NCL': 'GB', 'EMA': 'GB', 'LBA': 'GB', 'SEN': 'GB', 'BFS': 'GB', 'LCY': 'GB',
  // France
  'CDG': 'FR', 'ORY': 'FR', 'NCE': 'FR', 'LYS': 'FR', 'MRS': 'FR', 'TLS': 'FR', 'BOD': 'FR', 'NTE': 'FR', 'BVA': 'FR', 'MLH': 'FR', 'LIL': 'FR',
  // Spain
  'MAD': 'ES', 'BCN': 'ES', 'PMI': 'ES', 'AGP': 'ES', 'ALC': 'ES', 'VLC': 'ES', 'SVQ': 'ES', 'IBZ': 'ES', 'TFS': 'ES', 'LPA': 'ES', 'BIO': 'ES', 'TFN': 'ES', 'ACE': 'ES', 'FUE': 'ES', 'MAH': 'ES', 'REU': 'ES', 'GRO': 'ES',
  // Italy
  'FCO': 'IT', 'MXP': 'IT', 'LIN': 'IT', 'VCE': 'IT', 'NAP': 'IT', 'BGY': 'IT', 'BLQ': 'IT', 'CTA': 'IT', 'PMO': 'IT', 'PSA': 'IT', 'TRN': 'IT', 'FLR': 'IT', 'VRN': 'IT', 'BRI': 'IT', 'CAG': 'IT', 'OLB': 'IT', 'TSF': 'IT',
  // Netherlands
  'AMS': 'NL', 'EIN': 'NL', 'RTM': 'NL', 'MST': 'NL', 'GRQ': 'NL',
  // Belgium
  'BRU': 'BE', 'CRL': 'BE', 'ANR': 'BE', 'LGG': 'BE', 'OST': 'BE',
  // Austria
  'VIE': 'AT', 'SZG': 'AT', 'INN': 'AT', 'GRZ': 'AT', 'LNZ': 'AT', 'KLU': 'AT',
  // Portugal
  'LIS': 'PT', 'OPO': 'PT', 'FAO': 'PT', 'FNC': 'PT', 'PDL': 'PT',
  // Poland
  'WAW': 'PL', 'KRK': 'PL', 'GDN': 'PL', 'WRO': 'PL', 'POZ': 'PL', 'KTW': 'PL', 'WMI': 'PL', 'RZE': 'PL', 'LUZ': 'PL', 'SZZ': 'PL', 'BZG': 'PL',
  // Ireland
  'DUB': 'IE', 'SNN': 'IE', 'ORK': 'IE', 'KIR': 'IE', 'NOC': 'IE',
  // Greece
  'ATH': 'GR', 'SKG': 'GR', 'HER': 'GR', 'RHO': 'GR', 'CHQ': 'GR', 'CFU': 'GR', 'KGS': 'GR', 'ZTH': 'GR', 'JMK': 'GR', 'JTR': 'GR', 'EFL': 'GR', 'PVK': 'GR',
  // Sweden
  'ARN': 'SE', 'GOT': 'SE', 'MMX': 'SE', 'BMA': 'SE', 'NYO': 'SE', 'VST': 'SE',
  // Denmark
  'CPH': 'DK', 'BLL': 'DK', 'AAL': 'DK', 'AAR': 'DK',
  // Finland
  'HEL': 'FI', 'TMP': 'FI', 'OUL': 'FI', 'TKU': 'FI', 'RVN': 'FI',
  // Czech Republic
  'PRG': 'CZ', 'BRQ': 'CZ', 'OSR': 'CZ',
  // Hungary
  'BUD': 'HU', 'DEB': 'HU',
  // Switzerland (not EU but EC)
  'ZRH': 'CH', 'GVA': 'CH', 'BSL': 'CH',
  // Norway (EEA)
  'OSL': 'NO', 'BGO': 'NO', 'TRD': 'NO', 'SVG': 'NO', 'TOS': 'NO',
};

// Default to German authority if not found
function getAuthorityByAirport(airportCode: string): AuthorityInfo {
  const countryCode = airportCountryMap[airportCode.toUpperCase()];
  if (countryCode && nationalAuthorities[countryCode]) {
    return nationalAuthorities[countryCode];
  }
  // Default to German LBA
  return nationalAuthorities['DE'];
}

function formatDateEN(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function POST(req: NextRequest) {
  try {
    const data: EscalationData = await req.json();

    const authority = getAuthorityByAirport(data.departureAirport);
    const delayHours = Math.floor(data.delayMinutes / 60);
    const delayMins = data.delayMinutes % 60;
    const today = formatDateEN(new Date().toISOString());
    const flightDate = formatDateEN(data.flightDate);
    const claimSentDate = formatDateEN(data.claimSentDate);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { height } = page.getSize();
    let y = height - 50;
    const leftMargin = 50;
    const lineHeight = 15;

    const drawText = (text: string, options: { bold?: boolean; size?: number; indent?: number } = {}) => {
      const size = options.size || 10;
      const x = leftMargin + (options.indent || 0);
      page.drawText(text, {
        x,
        y,
        size,
        font: options.bold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight;
    };

    const drawLine = () => {
      y -= 6;
    };

    // Header
    drawText('COMPLAINT TO NATIONAL ENFORCEMENT BODY', { bold: true, size: 14 });
    drawText('Regarding Regulation (EC) No 261/2004', { size: 9 });
    drawLine();

    // Date
    drawText(`Date: ${today}`);
    drawLine();

    // Recipient (National Authority)
    drawText('To:', { bold: true });
    drawText(authority.fullName, { indent: 20 });
    drawText(`(${authority.name})`, { indent: 20 });
    drawText(`Email: ${authority.email}`, { indent: 20 });
    drawText(`Address: ${authority.address}`, { indent: 20 });
    drawLine();

    // Complainant info
    drawText('From (Complainant):', { bold: true });
    drawText(`${data.firstName} ${data.lastName}`, { indent: 20 });
    drawText(`Email: ${data.email}`, { indent: 20 });
    if (data.phone) drawText(`Phone: ${data.phone}`, { indent: 20 });
    drawText(`Address: ${data.address}`, { indent: 20 });
    drawLine();

    // Airline info
    drawText('Airline (Respondent):', { bold: true });
    drawText(data.airline, { indent: 20 });
    drawText(`Email: ${data.airlineEmail}`, { indent: 20 });
    drawLine();

    // Flight details
    drawText('Flight Details:', { bold: true });
    drawText(`Flight Number: ${data.flightNumber}`, { indent: 20 });
    drawText(`Date: ${flightDate}`, { indent: 20 });
    drawText(`Route: ${data.departureCity} (${data.departureAirport}) - ${data.arrivalCity}`, { indent: 20 });
    drawText(`Delay: ${delayHours} hours ${delayMins} minutes`, { indent: 20 });
    drawText(`Compensation claimed: EUR ${data.compensation}`, { indent: 20 });
    drawLine();

    // Complaint text
    drawText('Dear Sir/Madam,', { bold: true });
    drawLine();

    const complaintText = [
      'I hereby file a formal complaint against the above-mentioned airline for',
      'failure to comply with Regulation (EC) No 261/2004.',
      '',
      'BACKGROUND:',
      `On ${flightDate}, I was a passenger on flight ${data.flightNumber} from`,
      `${data.departureCity} to ${data.arrivalCity}. The flight arrived at its final`,
      `destination with a delay of ${delayHours} hours and ${delayMins} minutes.`,
      '',
      'PREVIOUS ATTEMPTS TO RESOLVE:',
      `1. I submitted a compensation claim directly to the airline on ${claimSentDate}.`,
    ];

    if (data.followUpDate) {
      complaintText.push(`2. I sent a follow-up request on ${formatDateEN(data.followUpDate)}.`);
    }

    if (data.airlineResponse === 'REJECTED') {
      complaintText.push('3. The airline rejected my claim without valid justification.');
    } else if (data.airlineResponse === 'NONE') {
      complaintText.push('3. The airline has failed to respond within a reasonable timeframe.');
    }

    complaintText.push(
      '',
      'REQUEST:',
      'I kindly request that your authority:',
      '1. Investigate this matter and determine whether the airline has violated',
      '   Regulation (EC) No 261/2004;',
      '2. Take appropriate enforcement action against the airline;',
      '3. Assist in resolving this dispute and securing the compensation owed to me.',
      '',
      'I have attached copies of:',
      '- My original compensation claim to the airline',
      '- Booking confirmation and boarding pass',
      '- Any correspondence with the airline',
      '',
      'I am available to provide any additional information required.',
      '',
      'Thank you for your assistance.',
    );

    for (const line of complaintText) {
      drawText(line);
    }

    drawLine();
    drawText('Yours faithfully,');
    drawLine();
    drawText(`${data.firstName} ${data.lastName}`);
    drawLine();
    drawText(`Date: ${today}`);
    drawText('Signature: _____________________');

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    // Return PDF with authority info in headers
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="complaint-${authority.name}-${data.flightNumber}.pdf"`,
        'X-Authority-Name': authority.name,
        'X-Authority-Email': authority.email,
        'X-Authority-Website': authority.website,
        'X-Authority-Country': authority.country,
      },
    });

  } catch (error) {
    console.error('Escalation PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}

// GET endpoint to just get authority info without generating PDF
export async function GET(req: NextRequest) {
  const airportCode = req.nextUrl.searchParams.get('airport');

  if (!airportCode) {
    return NextResponse.json({ error: 'Airport code required' }, { status: 400 });
  }

  const authority = getAuthorityByAirport(airportCode);
  return NextResponse.json(authority);
}
