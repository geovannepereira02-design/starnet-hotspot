const crypto = require('crypto');
const { liberarCliente } = require('../lib/mikrotik');

function validarAssinatura(headers, body, secret) {
  const signature = headers['x-signature'];
  const requestId = headers['x-request-id'];

  if (!signature || !requestId || !secret) {
    return false;
  }

  const signatureParts = String(signature)
    .split(',')
    .map((part) => part.trim());

  const ts = signatureParts.find((part) => part.startsWith('ts='));
  const hash = signatureParts.find((part) => part.startsWith('v1='));

  if (!ts || !hash) {
    return false;
  }

  const tsPart = ts.split('=')[1];
  const hashPart = hash.split('=')[1];

  if (!tsPart || !hashPart) {
    return false;
  }

  const notificationId = String(body?.data?.id || requestId);
  const manifest = `id:${notificationId};request-id:${requestId};ts:${tsPart};`;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(manifest);
  const expectedHash = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(hashPart, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

function isValidMac(mac) {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(mac || '');
}

function normalizeMac(mac) {
  return (mac || '').toUpperCase().replace(/-/g, ':').trim();
}

function extractMacFromPayment(payment) {
  const metadataMac = payment?.metadata?.mac_address || payment?.metadata?.macAddress;
  if (metadataMac) return normalizeMac(metadataMac);

  if (payment?.external_reference) return normalizeMac(payment.external_reference);

  return '';
}

async function fetchMercadoPagoPayment(paymentId, accessToken) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago retornou ${response.status}`);
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Metodo nao permitido' });
  }

  const webhookSecret = process.env.MP_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).json({ ok: false, error: 'MP_WEBHOOK_SECRET nao configurado' });
  }

  const assinaturaValida = validarAssinatura(req.headers, req.body, webhookSecret);
  if (!assinaturaValida) {
    return res.status(401).json({ ok: false, error: 'Assinatura X-Signature invalida' });
  }

  const eventType = req.body?.type;
  const action = req.body?.action;
  const paymentId = req.body?.data?.id;

  if (eventType !== 'payment' || !paymentId) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'Evento ignorado' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ ok: false, error: 'MP_ACCESS_TOKEN nao configurado' });
  }

  try {
    const payment = await fetchMercadoPagoPayment(paymentId, accessToken);

    if (payment.status !== 'approved') {
      return res.status(200).json({ ok: true, ignored: true, reason: `Status ${payment.status}` });
    }

    const macAddress = extractMacFromPayment(payment);
    if (!isValidMac(macAddress)) {
      return res.status(400).json({ ok: false, error: 'MAC ausente ou invalido no pagamento' });
    }

    await liberarCliente(macAddress, `Cliente Pago 30 Dias | Pagamento ${payment.id}`);

    return res.status(200).json({
      ok: true,
      action,
      paymentId: payment.id,
      macAddress,
      status: payment.status
    });
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error);
    return res.status(500).json({ ok: false, error: 'Falha no processamento do webhook' });
  }
};
