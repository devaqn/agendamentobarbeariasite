module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/api/**/*.test.js'],
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/db/seed.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};
