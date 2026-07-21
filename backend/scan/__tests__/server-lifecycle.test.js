import { startServer, stopServer } from '../server.js';

describe('scan-service lifecycle', () => {
  afterEach(async () => {
    await stopServer();
  });

  test('stops accepting requests during graceful shutdown', async () => {
    const server = await startServer({
      port: 0,
      loadModulesFn: async () => new Map(),
      validateConfiguration: false,
    });
    const address = server.address();
    expect(address).not.toBeNull();
    const port = typeof address === 'object' ? address.port : 0;

    const healthyResponse = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthyResponse.status).toBe(200);

    await stopServer();

    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});
