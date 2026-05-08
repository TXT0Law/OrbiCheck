export default {
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.js'],
  testTimeout: 10000,
  // P2-2 partial: the in-house withTimeout helper now cancels its setTimeout
  // via .finally(clearTimeout), so we no longer leak timers from our own
  // code. forceExit is still required because third-party imports (helmet,
  // got, express keep-alive agents) keep idle TCP/HTTP agents in the event
  // loop after tests finish. Without forceExit Jest hangs ~30s waiting for
  // those handles to expire. Removing forceExit is tracked as a follow-up
  // and depends on isolating those imports behind agent factories.
  forceExit: true,
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '\\._', '/\\._', '/__tests__/_helpers/'],
  collectCoverageFrom: ['server.js', 'registry.js', '*.js', '!**/node_modules/**', '!**/._*'],
  coverageDirectory: 'coverage',
};
