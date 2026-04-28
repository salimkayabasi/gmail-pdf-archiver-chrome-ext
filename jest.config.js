module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['./test/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.js'
  ],
  coverageDirectory: 'coverage'
};
