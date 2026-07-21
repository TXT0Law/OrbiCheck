export default {
  testEnvironment: 'node',
  setupFiles: ['./jest.setup.js'],
  testTimeout: 10000,
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\._',
    '/\\._',
    '/__tests__/_helpers/',
    '/__tests__/batch.live.test.js',
  ],
  collectCoverageFrom: [
    'server.js',
    'registry.js',
    '*.js',
    '!jest.live.config.js',
    '!**/node_modules/**',
    '!**/._*',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 55,
      functions: 70,
      lines: 70,
    },
  },
};
