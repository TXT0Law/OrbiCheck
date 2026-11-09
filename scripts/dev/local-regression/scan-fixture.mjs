import net from 'node:net';
import { pathToFileURL } from 'node:url';
process.env.NODE_ENV = 'test';
const originalConnect = net.Socket.prototype.connect;
const loopback = new Set(['localhost', '127.0.0.1', '::1']);
net.Socket.prototype.connect = function (...args) {
  const options = net._normalizeArgs(args)[0];
  if (!loopback.has(options.host || 'localhost')) throw new Error('External connections are disabled in local regression');
  return originalConnect.apply(this, args);
};
const { createApp, setModulesForTest } = await import(pathToFileURL(`${process.cwd()}/server.js`));
const modules = new Map();
for (const name of ['status', 'headers']) {
  const handler = () => { throw new Error('Only fixed runDirect fixtures are supported'); };
  handler.runDirect = async () => ({ success: true, statusCode: 200, durationMs: 1, data: { auditFixture: true, statusCode: 200, isUp: true, headers: {} } });
  modules.set(name, handler);
}
setModulesForTest(modules);
const fixturePort = Number(process.env.LOCAL_SCAN_PORT);
if (!Number.isInteger(fixturePort) || fixturePort < 1024 || fixturePort > 65535) throw new Error("Invalid local fixture port");
createApp().listen(fixturePort, '127.0.0.1');
