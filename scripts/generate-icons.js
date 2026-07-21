#!/usr/bin/env node
/**
 * scripts/generate-icons.js
 *
 * Converts public/icon.svg → public/icon-192.png and public/icon-512.png
 * using sharp-cli (already a transitive dependency via image tooling).
 *
 * Usage:
 *   node scripts/generate-icons.js
 *
 * Add to your build pipeline or run manually when the SVG source changes.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgSrc = join(root, 'public', 'icon.svg');

if (!existsSync(svgSrc)) {
  console.error('[generate-icons] public/icon.svg not found');
  process.exit(1);
}

const sizes = [192, 512];
for (const size of sizes) {
  const out = join(root, 'public', `icon-${size}.png`);
  try {
    execSync(`npx sharp-cli --input "${svgSrc}" --output "${out}" resize ${size} ${size}`, { stdio: 'inherit' });
    console.log(`[generate-icons] ✓ icon-${size}.png`);
  } catch (err) {
    console.error(`[generate-icons] Failed to generate icon-${size}.png:`, err.message);
    process.exit(1);
  }
}

console.log('[generate-icons] All icons generated successfully.');
