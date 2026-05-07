export default {
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.js'],
  testTimeout: 10000,
  forceExit: true,
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '\\._', '/\\._', '/__tests__/_helpers/'],
  collectCoverageFrom: ['server.js', 'registry.js', '*.js', '!**/node_modules/**', '!**/._*'],
  coverageDirectory: 'coverage',
};
