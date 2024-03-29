// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = require('./package.json').name.split('/').pop();

module.exports = {
    preset: 'ts-jest',
    moduleFileExtensions: ['ts', 'js', 'json'],
    collectCoverage: false,
    collectCoverageFrom: ['src/**/*.{ts,tsx}'],
    testRegex: `(/__tests__/.*|\\.(test|spec))\\.tsx?$`,
    moduleDirectories: ['node_modules'],
    // name: packageName,
    displayName: packageName,
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
        },
    },
};
