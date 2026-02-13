import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import { rmSync, existsSync } from 'fs';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

console.log(`🔨 Building OpenClaw ASUS Mesh Skill (${isProduction ? 'production' : 'development'})...`);

// Clean dist folder
if (existsSync('dist')) {
  rmSync('dist', { recursive: true, force: true });
  console.log('✓ Cleaned dist folder');
}

// Run TypeScript compiler for type declarations
console.log('📝 Generating type declarations...');
execSync('npx tsc --emitDeclarationOnly', { stdio: 'inherit' });
console.log('✓ Type declarations generated');

// Common esbuild options
const commonOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: !isProduction,
  minify: isProduction,
  external: [
    'pino',
    'ws',
    'axios',
    'eventemitter3',
    'node-cron',
    'snmp-native',
    'zod',
  ],
  banner: {
    js: '// OpenClaw ASUS Mesh WiFi Analyzer Skill\n// https://github.com/The-Geek-Freaks/openclaw_WIFI_DEBUGGER\n',
  },
};

if (isWatch) {
  // Watch mode
  const ctx = await esbuild.context({
    ...commonOptions,
    outfile: 'dist/index.js',
  });
  await ctx.watch();
  console.log('👀 Watching for changes...');
} else {
  // Build main bundle
  await esbuild.build({
    ...commonOptions,
    outfile: 'dist/bundle.js',
  });
  console.log('✓ Main bundle built');

  // Build CLI separately with shebang
  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/cli.ts'],
    outfile: 'dist/cli.js',
    banner: {
      js: '#!/usr/bin/env node\n// OpenClaw ASUS Mesh WiFi Analyzer CLI\n',
    },
  });
  console.log('✓ CLI entrypoint built with shebang');

  // Build individual entry points for tree-shaking
  const entryPoints = [
    { in: 'src/index.ts', out: 'index' },
    { in: 'src/skill/openclaw-skill.ts', out: 'skill/openclaw-skill' },
    { in: 'src/core/mesh-analyzer.ts', out: 'core/mesh-analyzer' },
    { in: 'src/core/zigbee-analyzer.ts', out: 'core/zigbee-analyzer' },
    { in: 'src/core/real-triangulation.ts', out: 'core/real-triangulation' },
    { in: 'src/infra/asus-ssh-client.ts', out: 'infra/asus-ssh-client' },
  ];

  await esbuild.build({
    ...commonOptions,
    entryPoints: entryPoints.map(e => e.in),
    outdir: 'dist',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
  });
  console.log('✓ Individual modules built with code splitting');

  // Print bundle sizes
  const { statSync } = await import('fs');
  const bundleSize = statSync('dist/bundle.js').size;
  console.log(`\n📦 Bundle size: ${(bundleSize / 1024).toFixed(1)} KB`);
  
  if (isProduction) {
    console.log('🚀 Production build complete!');
  } else {
    console.log('✅ Development build complete!');
  }
}
