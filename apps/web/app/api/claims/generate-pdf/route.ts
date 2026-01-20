import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface PassengerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  passportNumber: string;
  bookingReference: string;
}

interface FlightData {
  flightNumber: string;
  date: string;
  departureCity: string;
  arrivalCity: string;
  compensation: number;
  delayMinutes: number;
}

// Map flight number prefix to airline name and email
const airlineInfo: Record<string, { name: string; email: string }> = {
  'FR': { name: 'Ryanair DAC', email: 'customerqueries@ryanair.com' },
  'U2': { name: 'EasyJet Airline Company Limited', email: 'customerservices@easyjet.com' },
  'W6': { name: 'Wizz Air Hungary Ltd', email: 'info@wizzair.com' },
  'VY': { name: 'Vueling Airlines S.A.', email: 'customers@vueling.com' },
  'LH': { name: 'Deutsche Lufthansa AG', email: 'customer.relations@lufthansa.com' },
  'AF': { name: 'Air France S.A.', email: 'mail.customercare.france@airfrance.fr' },
  'KL': { name: 'KLM Royal Dutch Airlines', email: 'klmcares@klm.com' },
  'BA': { name: 'British Airways Plc', email: 'customer.relations@ba.com' },
  'IB': { name: 'Iberia Lineas Aereas de Espana S.A.', email: 'iberia@iberia.es' },
  'AZ': { name: 'ITA Airways', email: 'support@ita-airways.com' },
  'TP': { name: 'TAP Air Portugal', email: 'customer@flytap.com' },
  'SK': { name: 'Scandinavian Airlines System', email: 'customer-relations@sas.se' },
  'EI': { name: 'Aer Lingus Limited', email: 'customerrelations@aerlingus.com' },
  'W4': { name: 'Wizz Air Malta Ltd', email: 'info@wizzair.com' },
};

function getAirlineInfo(flightNumber: string): { name: string; email: string } {
  const prefix = flightNumber.substring(0, 2).toUpperCase();
  return airlineInfo[prefix] || { name: 'The Airline', email: 'customer.service@airline.com' };
}

function formatDateEN(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export async function POST(req: NextRequest) {
  try {
    const { passenger, flight }: { passenger: PassengerData; flight: FlightData } = await req.json();

    const airline = getAirlineInfo(flight.flightNumber);
    const delayHours = Math.floor(flight.delayMinutes / 60);
    const delayMins = flight.delayMinutes % 60;
    const today = formatDateEN(new Date().toISOString());
    const flightDate = formatDateEN(flight.date);

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { height } = page.getSize();
    let y = height - 50;
    const leftMargin = 50;
    const lineHeight = 16;

    // Helper function to draw text
    const drawText = (text: string, options: { bold?: boolean; size?: number; indent?: number } = {}) => {
      const size = options.size || 11;
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
      y -= 8;
    };

    // Header
    drawText('COMPENSATION CLAIM', { bold: true, size: 16 });
    drawText('Under Regulation (EC) No 261/2004', { size: 10 });
    drawLine();

    // Date
    drawText(`Date: ${today}`);
    drawLine();

    // Recipient
    drawText('To:', { bold: true });
    drawText(airline.name, { indent: 20 });
    drawText(`Email: ${airline.email}`, { indent: 20 });
    drawLine();

    // Sender info
    drawText('From:', { bold: true });
    drawText(`${passenger.firstName} ${passenger.lastName}`, { indent: 20 });
    drawText(`Email: ${passenger.email}`, { indent: 20 });
    if (passenger.phone) drawText(`Phone: ${passenger.phone}`, { indent: 20 });
    drawText(`Address: ${passenger.address}`, { indent: 20 });
    drawText(`Passport: ${passenger.passportNumber}`, { indent: 20 });
    if (passenger.bookingReference) drawText(`Booking Reference: ${passenger.bookingReference}`, { indent: 20 });
    drawLine();

    // Flight details
    drawText('Flight Details:', { bold: true });
    drawText(`Flight Number: ${flight.flightNumber}`, { indent: 20 });
    drawText(`Date of Flight: ${flightDate}`, { indent: 20 });
    drawText(`Route: ${flight.departureCity} - ${flight.arrivalCity}`, { indent: 20 });
    drawText(`Arrival Delay: ${delayHours} hours ${delayMins} minutes`, { indent: 20 });
    drawLine();

    // Claim text
    drawText('Dear Sir/Madam,', { bold: true });
    drawLine();

    const claimText = [
      `I am writing to claim compensation for the significant delay of flight ${flight.flightNumber}`,
      `on ${flightDate} from ${flight.departureCity} to ${flight.arrivalCity}.`,
      '',
      `The flight arrived at its final destination with a delay of ${delayHours} hours`,
      `and ${delayMins} minutes.`,
      '',
      'In accordance with Regulation (EC) No 261/2004 of the European Parliament and',
      'of the Council of 11 February 2004, establishing common rules on compensation',
      'and assistance to passengers in the event of denied boarding and of cancellation',
      'or long delay of flights, I am entitled to monetary compensation.',
      '',
      'According to Article 7 of the aforementioned Regulation, the compensation amount is:',
      '',
      `                    EUR ${flight.compensation}`,
      '',
      'I kindly request payment of the above amount within 14 days of receipt of this',
      'claim to the following bank details:',
      '',
      '[Please provide your bank details: IBAN, BIC/SWIFT, Bank Name]',
      '',
      'In case of refusal or failure to respond within the specified period, I will be',
      'compelled to pursue my claim through the national civil aviation authority and/or',
      'through legal proceedings, seeking reimbursement of all associated costs.',
      '',
      'I have attached copies of my booking confirmation and boarding pass as evidence.',
    ];

    for (const line of claimText) {
      drawText(line);
    }

    drawLine();
    drawText('Yours faithfully,');
    drawLine();
    drawText(`${passenger.firstName} ${passenger.lastName}`);
    drawLine();
    drawText(`Date: ${today}`);
    drawText('Signature: _____________________');

    // Footer
    y = 40;
    page.drawText('Document generated at FlightClaim.com', {
      x: leftMargin,
      y,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="claim-${flight.flightNumber}-${flight.date}.pdf"`,
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
