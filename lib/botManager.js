function shouldStartBot(config = {}) {
  return config.enabled !== false;
}

async function shutdownClients(clients = []) {
  const list = Array.isArray(clients) ? clients : [clients];

  for (const client of list) {
    if (!client || typeof client.destroy !== 'function') continue;

    try {
      if (typeof client.gatewayCleanup === 'function') client.gatewayCleanup();
      await client.destroy();
      console.log(`[${client.config?.id || 'bot'}] Disconnected.`);
    } catch (err) {
      console.error(`[${client.config?.id || 'bot'}] Shutdown error:`, err.message);
    }
  }
}

function attachShutdownHandlers(clients = []) {
  const handleShutdown = async () => {
    console.log('Shutting down all bots...');
    await shutdownClients(clients);
    process.exit(0);
  };

  process.once('SIGINT', async () => {
    await handleShutdown();
  });

  process.once('SIGTERM', async () => {
    await handleShutdown();
  });

  return handleShutdown;
}

module.exports = { shouldStartBot, shutdownClients, attachShutdownHandlers };
