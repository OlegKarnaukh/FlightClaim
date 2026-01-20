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
  'FR': { name: 'Ryanair', email: 'customerqueries@ryanair.com' },
  'U2': { name: 'EasyJet', email: 'customerservices@easyjet.com' },
  'W6': { name: 'Wizz Air', email: 'info@wizzair.com' },
  'VY': { name: 'Vueling', email: 'customers@vueling.com' },
  'LH': { name: 'Lufthansa', email: 'customer.relations@lufthansa.com' },
  'AF': { name: 'Air France', email: 'mail.customercare.france@airfrance.fr' },
  'KL': { name: 'KLM', email: 'klmcares@klm.com' },
  'BA': { name: 'British Airways', email: 'customer.relations@ba.com' },
  'IB': { name: 'Iberia', email: 'iberia@iberia.es' },
  'AZ': { name: 'ITA Airways', email: 'support@ita-airways.com' },
  'TP': { name: 'TAP Portugal', email: 'customer@flytap.com' },
  'SK': { name: 'SAS', email: 'customer-relations@sas.se' },
  'EI': { name: 'Aer Lingus', email: 'customerrelations@aerlingus.com' },
};

function getAirlineInfo(flightNumber: string): { name: string; email: string } {
  const prefix = flightNumber.substring(0, 2).toUpperCase();
  return airlineInfo[prefix] || { name: 'Авиакомпания', email: 'customer.service@airline.com' };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function POST(req: NextRequest) {
  try {
    const { passenger, flight }: { passenger: PassengerData; flight: FlightData } = await req.json();

    const airline = getAirlineInfo(flight.flightNumber);
    const delayHours = Math.floor(flight.delayMinutes / 60);
    const delayMins = flight.delayMinutes % 60;
    const today = formatDate(new Date().toISOString());

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const { height } = page.getSize();
    let y = height - 50;
    const leftMargin = 50;
    const lineHeight = 18;

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
      y -= 10;
    };

    // Header
    drawText('ПРЕТЕНЗИЯ', { bold: true, size: 16 });
    drawText(`о выплате компенсации согласно Регламенту (ЕС) № 261/2004`, { size: 10 });
    drawLine();

    // Date and recipient
    drawText(`Дата: ${today}`);
    drawLine();
    drawText(`Кому: ${airline.name}`, { bold: true });
    drawText(`Email: ${airline.email}`);
    drawLine();

    // Sender info
    drawText(`От: ${passenger.lastName} ${passenger.firstName}`, { bold: true });
    drawText(`Email: ${passenger.email}`);
    if (passenger.phone) drawText(`Телефон: ${passenger.phone}`);
    drawText(`Адрес: ${passenger.address}`);
    drawText(`Паспорт: ${passenger.passportNumber}`);
    if (passenger.bookingReference) drawText(`Номер бронирования: ${passenger.bookingReference}`);
    drawLine();

    // Flight details
    drawText('Информация о рейсе:', { bold: true });
    drawText(`Номер рейса: ${flight.flightNumber}`, { indent: 20 });
    drawText(`Дата вылета: ${formatDate(flight.date)}`, { indent: 20 });
    drawText(`Маршрут: ${flight.departureCity} - ${flight.arrivalCity}`, { indent: 20 });
    drawText(`Задержка прибытия: ${delayHours} ч. ${delayMins} мин.`, { indent: 20 });
    drawLine();

    // Claim text
    drawText('Уважаемые представители авиакомпании,', { bold: true });
    drawLine();

    const claimText = [
      `Настоящим уведомляю вас о том, что рейс ${flight.flightNumber} от ${formatDate(flight.date)}`,
      `по маршруту ${flight.departureCity} - ${flight.arrivalCity} прибыл в пункт назначения`,
      `с задержкой ${delayHours} часов ${delayMins} минут.`,
      '',
      `В соответствии с Регламентом (ЕС) № 261/2004 Европейского Парламента и Совета`,
      `от 11 февраля 2004 года, устанавливающим общие правила в отношении компенсации`,
      `и помощи пассажирам в случае отказа в посадке, отмены рейса или длительной`,
      `задержки рейса, я имею право на денежную компенсацию.`,
      '',
      `Согласно статье 7 указанного Регламента, размер компенсации составляет:`,
      '',
      `                    ${flight.compensation} EUR`,
      '',
      `Прошу выплатить указанную сумму в течение 14 дней с момента получения`,
      `настоящей претензии на следующие реквизиты:`,
      '',
      `[Укажите ваши банковские реквизиты]`,
      '',
      `В случае отказа или отсутствия ответа в установленный срок, я буду вынужден(а)`,
      `обратиться в национальный надзорный орган гражданской авиации и/или в суд`,
      `для защиты своих прав с требованием о возмещении всех судебных издержек.`,
    ];

    for (const line of claimText) {
      drawText(line);
    }

    drawLine();
    drawText('С уважением,');
    drawText(`${passenger.lastName} ${passenger.firstName}`);
    drawLine();
    drawText(`Дата: ${today}`);
    drawText('Подпись: _____________________');

    // Footer
    y = 50;
    page.drawText('Документ сформирован на FlightClaim.com', {
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
