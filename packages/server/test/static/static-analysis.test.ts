import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const srcDir = join(import.meta.dirname, '..', '..', 'src');

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full);
    }
  }
  return files;
}

// A4: every site interaction must go through a base URL and token read
// from this app's own persisted configuration, never a hardcoded
// value. There is no site-calling code yet (Group C builds the
// registry/proxy routes) - this guard exists now so it starts doing
// real work the moment that code is added, rather than being bolted
// on after the fact.
const HARDCODED_URL_PATTERN = /https?:\/\/[^'"`\s]+/;

// Each entry names why a literal URL there is legitimate, not a
// hardcoded site.
const HARDCODED_URL_ALLOWLIST = new Set<string>([]);

function containsHardcodedUrl(contents: string): boolean {
  return HARDCODED_URL_PATTERN.test(contents);
}

test('A4 mechanism check (positive control): the hardcoded-URL pattern actually distinguishes a violating file from a compliant one', () => {
  const violating = `
    export async function fetchSite() {
      return fetch('https://client-one.example.com/v1/capabilities');
    }
  `;
  const compliant = `
    export async function fetchSite(baseUrl: string) {
      return fetch(new URL('/v1/capabilities', baseUrl));
    }
  `;

  assert.equal(containsHardcodedUrl(violating), true, 'must flag the violating fixture');
  assert.equal(containsHardcodedUrl(compliant), false, 'must not flag the compliant fixture');
});

test('A4: no hardcoded http(s) URL literal exists in packages/server/src outside a reasoned allowlist', () => {
  const offenders: string[] = [];
  for (const file of listTsFiles(srcDir)) {
    const relPath = relative(srcDir, file);
    const contents = readFileSync(file, 'utf-8');
    if (containsHardcodedUrl(contents) && !HARDCODED_URL_ALLOWLIST.has(relPath)) {
      offenders.push(relPath);
    }
  }
  assert.deepEqual(offenders, [], `unreviewed hardcoded URL usage in: ${offenders.join(', ')}`);
});
