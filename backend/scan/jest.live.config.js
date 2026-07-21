import baseConfig from './jest.config.js';

export default {
  ...baseConfig,
  collectCoverage: false,
  testMatch: ['**/__tests__/batch.live.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '\\._', '/\\._', '/__tests__/_helpers/'],
};
