// trace-route is disabled (P1-9). The .js file is preserved so a future
// agent can wire up an execFile-based implementation, but the registry must
// NOT auto-register it. These tests guard that boundary.

import { handler } from '../trace-route.js';

function createResponseCapture() {
  return {
    headersSent: false,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.headersSent = true;
      this.body = body;
      return this;
    },
  };
}

describe('trace-route module (disabled)', () => {
  it('the module file still exposes a handler so it can be re-enabled later', () => {
    expect(typeof handler).toBe('function');
  });

  it('handler returns a disabled-status envelope when called directly', async () => {
    const req = { query: { url: 'https://example.com' } };
    const res = createResponseCapture();
    await handler(req, res);
    // Disabled response is still a successful envelope (data carries note).
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('disabled');
  });

  it('is NOT registered in module registry (regression guard)', async () => {
    const { loadModules } = await import('../registry.js');
    const modules = await loadModules();

    expect(modules.has('trace-route')).toBe(false);
  });
});
