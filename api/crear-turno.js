const { google } = require('googleapis');

function sumarUnaHora(date, time) {
  const [h, m] = time.split(':').map(Number);
  const horaFin = (h + 1) % 24;
  const cruzaMedianoche = h + 1 >= 24;

  let [y, mo, d] = date.split('-').map(Number);
  if (cruzaMedianoche) {
    const siguiente = new Date(Date.UTC(y, mo - 1, d + 1));
    y = siguiente.getUTCFullYear();
    mo = siguiente.getUTCMonth() + 1;
    d = siguiente.getUTCDate();
  }

  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(horaFin)}:${pad(m)}:00`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const { name, phone, date, time, message } = req.body || {};

    if (!name || !date || !time) {
      res.status(400).json({ error: 'Faltan datos (nombre, fecha u hora)' });
      return;
    }

    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar.events']
    );

    const calendar = google.calendar({ version: 'v3', auth });

    const evento = {
      summary: `Turno - ${name}`,
      description: [
        phone ? `Teléfono: ${phone}` : null,
        message ? `Motivo: ${message}` : null,
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: `${date}T${time}:00`,
        timeZone: 'America/Argentina/Buenos_Aires',
      },
      end: {
        dateTime: sumarUnaHora(date, time),
        timeZone: 'America/Argentina/Buenos_Aires',
      },
    };

    const resultado = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: evento,
    });

    res.status(200).json({ ok: true, eventId: resultado.data.id, htmlLink: resultado.data.htmlLink });
  } catch (err) {
    console.error('Error creando turno en Google Calendar:', err);
    res.status(500).json({ error: 'No se pudo agendar en Google Calendar' });
  }
};
