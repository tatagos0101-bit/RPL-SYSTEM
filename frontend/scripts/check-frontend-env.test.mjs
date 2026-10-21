import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { assertFrontendEnvironment, serverEnvironmentNames } from './check-frontend-env.mjs'

test('allows public API configuration and ordinary Vercel build variables', () => {
  assert.doesNotThrow(() => assertFrontendEnvironment({
    VITE_API_URL: 'https://example.test', NODE_ENV: 'production',
    VERCEL: '1', VERCEL_ENV: 'production', VERCEL_OIDC_TOKEN: 'synthetic-platform-token',
    PATH: 'synthetic-path', SystemRoot: 'synthetic-system-root',
  }))
})

test('rejects server settings, public-prefixed variants and integration namespaces', () => {
  for (const name of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PASSWORD',
    'POSTGRES_USER', 'POSTGRES_HOST', 'POSTGRES_DATABASE', 'POSTGRES_PRISMA_URL',
    'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'DATABASE_URL', 'JWT_SECRET_KEY',
    'LIBRARIAN_AUTH_CODE', 'ENTRY_STATION_PIN', 'RATE_LIMIT_STORAGE_URI', 'RATE_LIMIT_REQUIRE_SHARED']) {
    for (const prefix of ['', 'VITE_', 'NEXT_PUBLIC_']) {
      assert.deepEqual(serverEnvironmentNames({ [prefix + name]: 'synthetic-value' }), [prefix + name])
    }
  }
  for (const name of ['REDIS_URL', 'KV_URL', 'RPL_REDIS_STAGING_REDIS_URL',
    'RPL_REDIS_STAGING_KV_REST_API_READ_ONLY_TOKEN', 'VITE_KV_REST_API_TOKEN']) {
    assert.throws(() => assertFrontendEnvironment({ [name]: 'synthetic-value' }), /Frontend build refused/)
  }
})

test('reports only names and refuses even empty server configuration', () => {
  const secret = 'synthetic-secret-value-never-log'
  assert.throws(() => assertFrontendEnvironment({ SUPABASE_SECRET_KEY: secret }), error => (
    error.message.includes('SUPABASE_SECRET_KEY') && !error.message.includes(secret)
  ))
  assert.throws(() => assertFrontendEnvironment({ POSTGRES_URL: '' }), /POSTGRES_URL/)
})

test('actual Vite build fails before emitting assets, including custom build modes', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'rpl-env-guard-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  const frontend = fileURLToPath(new URL('..', import.meta.url))
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    ['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'].includes(name.toUpperCase())))
  const secret = 'synthetic-build-secret-never-log'
  const output = join(temporary, 'dist')
  const result = spawnSync(process.execPath, [vite, 'build', '--mode', 'staging', '--outDir', output], {
    cwd: frontend, env: { ...environment, SUPABASE_SERVICE_ROLE_KEY: secret }, encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Frontend build refused server configuration: SUPABASE_SERVICE_ROLE_KEY/)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret))
  assert.equal(existsSync(output), false)
})
