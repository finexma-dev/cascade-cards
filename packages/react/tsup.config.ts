import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
    styles: 'src/styles.css',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'es2022',
  external: ['react', 'react-dom'],
  loader: {
    '.css': 'copy',
  },
});
