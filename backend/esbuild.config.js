import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const lambdasDir = './lambdas';
const outDir = './dist';

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const entryPoints = readdirSync(lambdasDir)
  .filter(file => file.endsWith('.ts'))
  .map(file => join(lambdasDir, file));

async function build() {
  await esbuild.build({
    entryPoints,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    sourcemap: true,
    minify: true,
    external: [
      '@aws-sdk/client-dynamodb',
      '@aws-sdk/lib-dynamodb',
      '@aws-sdk/client-apigatewaymanagementapi',
      '@aws-sdk/client-s3'
    ],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
    }
  });
  console.log('Build complete!');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
