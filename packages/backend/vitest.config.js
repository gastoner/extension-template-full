import { resolve, join } from 'node:path';

const PACKAGE_ROOT = __dirname;
const WORKSPACE_ROOT = join(__dirname, '..', '..');

const config = {
  test: {
    globals: true,
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
    },
  },
  resolve: {
    alias: {
      '@podman-desktop/api': resolve(WORKSPACE_ROOT, '__mocks__', '@podman-desktop', 'api.ts'),
      '/@/': join(PACKAGE_ROOT, 'src') + '/',
      '/@gen/': join(PACKAGE_ROOT, 'src-generated') + '/',
      '/@shared/': join(PACKAGE_ROOT, '../shared') + '/',
    },
  },
};

export default config;
