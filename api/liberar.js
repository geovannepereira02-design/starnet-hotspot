const { liberarCliente } = require('../lib/mikrotik');

function isValidMac(mac) {
  return /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(mac || '');
}

function normalizeMac(mac) {
  return (mac || '').toUpperCase().replace(/-/g, ':');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Metodo nao permitido' });
  }

  const configuredApiKey = process.env.LIBERAR_API_KEY;
  if (configuredApiKey) {
    const incomingApiKey = req.headers['x-api-key'];
    if (incomingApiKey !== configuredApiKey) {
      return res.status(401).json({ ok: false, error: 'Nao autorizado' });
    }
  }

  const macAddress = normalizeMac(req.body?.macAddress);
  if (!isValidMac(macAddress)) {
    return res.status(400).json({ ok: false, error: 'MAC invalido' });
  }

  try {
    await liberarCliente(macAddress, 'Cliente Pago 30 Dias');
    return res.status(200).json({ ok: true, macAddress });
  } catch (error) {
    console.error('Erro ao liberar no MikroTik:', error);
    return res.status(500).json({ ok: false, error: 'Falha ao liberar cliente' });
  }
};
