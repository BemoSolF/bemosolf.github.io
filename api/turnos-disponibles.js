const { calcularDisponibilidad } = require('./_disponibilidad');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  try {
    const dias = await calcularDisponibilidad();
    res.status(200).json({ dias });
  } catch (err) {
    console.error('Error obteniendo disponibilidad:', err);
    res.status(500).json({ error: 'No se pudo obtener la disponibilidad' });
  }
};
