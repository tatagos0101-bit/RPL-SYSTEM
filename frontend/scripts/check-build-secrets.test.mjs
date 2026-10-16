import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { scanBuild } from './check-build-secrets.mjs'

function artifact(t, contents) {
  const dir = mkdtempSync(join(tmpdir(), 'rpl-artifact-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'index.html'), '<html></html>')
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'app.js'), contents)
  return dir
}

function jwt(role) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.synthetic_signature`
}

test('allows public Supabase configuration and ordinary bundles', t => {
  const dir = artifact(t, `https://example.supabase.co sb_publishable_synthetic ${jwt('anon')}`)
  assert.deepEqual(scanBuild(dir, {}).findings, [])
})

test('detects secret keys and privileged JWTs without environment access', t => {
  for (const value of ['sb_secret_synthetic_test_value', jwt('service_role'),
    'postgresql://fake:synthetic-password@localhost/test', '-----BEGIN PRIVATE KEY-----',
    'rediss://:synthetic-password@localhost:6379/0']) {
    const dir = artifact(t, value)
    const result = scanBuild(dir, {})
    assert.equal(result.findings.length, 1)
    assert.ok(!JSON.stringify(result).includes(value))
  }
})

test('detects raw, URL-encoded and JSON-escaped known secrets', t => {
  const secret = 'synthetic+secret/with"quotes'
  for (const value of [secret, encodeURIComponent(secret), JSON.stringify(secret)]) {
    const result = scanBuild(artifact(t, value), { VITE_JWT_SECRET_KEY: secret })
    assert.deepEqual(result.findings[0].reasons, ['VITE_JWT_SECRET_KEY'])
    assert.ok(!JSON.stringify(result).includes(secret))
  }
})

test('detects an extracted database password in a nested source map', t => {
  const dir = artifact(t, 'ordinary code')
  writeFileSync(join(dir, 'assets', 'app.js.map'), 'synthetic-db-password')
  const result = scanBuild(dir, { POSTGRES_URL: 'postgresql://fake:synthetic-db-password@localhost/test' })
  assert.equal(result.findings.length, 1)
  assert.deepEqual(result.findings[0].reasons, ['POSTGRES_URL'])
})

test('fails on a missing build instead of reporting a clean scan', t => {
  const dir = artifact(t, '')
  assert.throws(() => scanBuild(join(dir, 'missing'), {}))
})

test('CLI fails without printing a supplied credential when build contains it', t => {
  const dir = artifact(t, 'synthetic-cli-secret-value')
  const scriptDir = join(dir, 'scripts')
  mkdirSync(scriptDir)
  // Copy scanner so its fixed ../dist target is an isolated synthetic artifact.
  const source = fileURLToPath(new URL('./check-build-secrets.mjs', import.meta.url))
  const script = join(scriptDir, 'check-build-secrets.mjs')
  writeFileSync(script, readFileSync(source))
  mkdirSync(join(dir, 'dist'))
  writeFileSync(join(dir, 'dist', 'index.html'), 'synthetic-cli-secret-value')
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8', env: { ...process.env, JWT_SECRET_KEY: 'synthetic-cli-secret-value' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /JWT_SECRET_KEY/)
  assert.ok(!`${result.stdout}${result.stderr}`.includes('synthetic-cli-secret-value'))
})
