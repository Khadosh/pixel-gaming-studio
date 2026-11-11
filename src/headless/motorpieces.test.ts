// The engine installs light (Khadosh/estudio#766): `npm ci --omit=dev` brings
// only `dependencies`, and those are exactly the packages the engine loads —
// what bin/pgs and bin/pgs-mcp reach by import, plus the loader the bin scripts
// name. The app (React, Radix, Vite, Supabase…) lives in devDependencies: it is
// bundled at build time, so where it is declared only matters to who installs.
// Before, a guest installing the studio's workshop downloaded 443 MB for an
// engine that used five packages; now about 40. This walks the real import
// graph with the TypeScript parser (type-only imports do not load anything), so
// a new engine import of a dev package is red here, not on a guest's machine.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const ENTRIES = ['src/headless/cli.ts', 'src/headless/mcp.ts'];
const BINS = ['bin/pgs', 'bin/pgs-mcp'];
const EXTS = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : resolve(dirname(from), spec);
  for (const b of [base, base.replace(/\.js$/, '')]) {
    for (const e of EXTS) {
      const f = b + e;
      if (existsSync(f) && statSync(f).isFile()) return f;
    }
  }
  return null;
}

/** The specifiers a file loads at run time: imports and re-exports that are not type-only, and import('…'). */
function runtimeSpecifiers(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const typeOnly = c?.isTypeOnly
        || (c && !c.name && c.namedBindings && ts.isNamedImports(c.namedBindings)
          && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) out.push(n.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) && !n.isTypeOnly) {
      out.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteralLike(a)) out.push(a.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

function packageOf(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Every package the engine loads, with the first file that asks for it. */
function enginePackages(): Map<string, string> {
  const seen = new Set<string>();
  const pkgs = new Map<string, string>();
  const pending = ENTRIES.map((e) => join(ROOT, e));
  while (pending.length) {
    const f = pending.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const s of runtimeSpecifiers(f)) {
      if (s.startsWith('.') || s.startsWith('@/')) {
        const r = resolveLocal(s, f);
        if (!r) throw new Error(`${f}: cannot resolve ${s}`);
        pending.push(r);
      } else if (!s.startsWith('node:')) {
        const p = packageOf(s);
        if (!pkgs.has(p)) pkgs.set(p, f.slice(ROOT.length + 1));
      }
    }
  }
  for (const b of BINS) {
    for (const m of readFileSync(join(ROOT, b), 'utf8').matchAll(/node_modules\/((?:@[^/]+\/)?[^/"']+)/g)) {
      if (!pkgs.has(m[1])) pkgs.set(m[1], b);
    }
  }
  return pkgs;
}

describe('the engine installs light (npm ci --omit=dev)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies ?? {}).sort();
  const engine = enginePackages();

  it('every package the engine loads is in dependencies', () => {
    const missing = [...engine].filter(([p]) => !deps.includes(p)).map(([p, f]) => `${p} (from ${f})`);
    expect(missing, 'move these from devDependencies to dependencies').toEqual([]);
  });

  it('dependencies holds nothing the engine does not load (the app goes in devDependencies)', () => {
    const extra = deps.filter((d) => !engine.has(d));
    expect(extra, 'only used by the app or the tooling: move to devDependencies').toEqual([]);
  });

  it('sees the engine it is guarding', () => {
    expect([...engine.keys()].sort()).toEqual(expect.arrayContaining(['@modelcontextprotocol/sdk', 'pngjs', 'tsx']));
  });
});
