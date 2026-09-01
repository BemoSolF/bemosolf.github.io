const { google } = require('googleapis');

const TZ = 'America/Argentina/Buenos_Aires';
const OFFSET = '-03:00'; // Argentina no tiene horario de verano, offset fijo
const DIAS_ATIENDE = [1, 2, 3, 4, 5, 6]; // Lunes(1) a Sábado(6), Domingo(0) excluido
const HORA_INICIO = 9;
const HORA_FIN = 19; // último turno empieza a las 18:00 y termina a las 19:00
const DURACION_MIN = 60;
const DIAS_ANTICIPACION = 7;

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function getAhoraArgentina() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const partes = {};
  fmt.formatToParts(new Date()).forEach((p) => { partes[p.type] = p.value; });
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    horaActual: Number(partes.hour) + Number(partes.minute) / 60,
  };
}

function sumarDias(fechaISO, n) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d + n));
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
}

function diaDeLaSemana(fechaISO) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function etiquetaFecha(fechaISO) {
  const [, m, d] = fechaISO.split('-').map(Number);
  return `${NOMBRES_DIA[diaDeLaSemana(fechaISO)]} ${d}/${m}`;
}

async function obtenerCalendarClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// Calcula los días/horarios habilitados dentro de la ventana de anticipación,
// y devuelve además los períodos ocupados según Google Calendar (freebusy).
async function calcularDisponibilidad() {
  const calendar = await obtenerCalendarClient();
  const { fecha: hoy, horaActual } = getAhoraArgentina();

  const primerDia = hoy;
  const ultimoDia = sumarDias(hoy, DIAS_ANTICIPACION - 1);

  const respuesta = await calendar.freebusy.query({
    requestBody: {
      timeMin: `${primerDia}T00:00:00${OFFSET}`,
      timeMax: `${ultimoDia}T23:59:59${OFFSET}`,
      timeZone: TZ,
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
    },
  });

  const ocupados = (respuesta.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy || []).map((b) => ({
    inicio: new Date(b.start),
    fin: new Date(b.end),
  }));

  const dias = [];
  for (let i = 0; i < DIAS_ANTICIPACION; i++) {
    const fechaISO = sumarDias(hoy, i);
    if (!DIAS_ATIENDE.includes(diaDeLaSemana(fechaISO))) continue;

    const slots = [];
    for (let hora = HORA_INICIO; hora + DURACION_MIN / 60 <= HORA_FIN; hora++) {
      if (fechaISO === hoy && hora <= horaActual) continue; // no ofrecer horarios ya pasados

      const inicioSlot = new Date(`${fechaISO}T${pad(hora)}:00:00${OFFSET}`);
      const finSlot = new Date(inicioSlot.getTime() + DURACION_MIN * 60000);

      const ocupado = ocupados.some((o) => inicioSlot < o.fin && finSlot > o.inicio);
      if (!ocupado) slots.push(`${pad(hora)}:00`);
    }

    dias.push({ date: fechaISO, label: etiquetaFecha(fechaISO), slots });
  }

  return dias;
}

function slotEstaLibre(dias, date, time) {
  const dia = dias.find((d) => d.date === date);
  return !!dia && dia.slots.includes(time);
}

module.exports = { calcularDisponibilidad, slotEstaLibre, obtenerCalendarClient, DIAS_ATIENDE, HORA_INICIO, HORA_FIN };
