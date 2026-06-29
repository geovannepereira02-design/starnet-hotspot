const { RouterOSClient } = require('routeros-client');

function getMikroTikConfig() {
  const { MIKROTIK_HOST, MIKROTIK_USER, MIKROTIK_PASSWORD, MIKROTIK_PORT } = process.env;

  if (!MIKROTIK_HOST || !MIKROTIK_USER || !MIKROTIK_PASSWORD) {
    throw new Error('Defina MIKROTIK_HOST, MIKROTIK_USER e MIKROTIK_PASSWORD no .env');
  }

  return {
    host: MIKROTIK_HOST,
    user: MIKROTIK_USER,
    password: MIKROTIK_PASSWORD,
    port: Number(MIKROTIK_PORT || 8728)
  };
}

async function liberarCliente(macAddress, comment = 'Cliente Pago 30 Dias') {
  const client = new RouterOSClient(getMikroTikConfig());

  await client.connect();
  try {
    await client.write('/ip/hotspot/ip-binding/add', {
      'mac-address': macAddress,
      type: 'bypassed',
      comment
    });
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = { liberarCliente };
