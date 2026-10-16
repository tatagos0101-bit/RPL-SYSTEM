import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const secretName = /^(?:VITE_|NEXT_PUBLIC_)?(?:DATABASE_URL|POSTGRES_URL|POSTGRES_URL_NON_POOLING|POSTGRES_PRISMA_URL|POSTGRES_PASSWORD|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_JWT_SECRET|JWT_SECRET_KEY|LIBRARIAN_AUTH_CODE|ENTRY_STATION_PIN|RATE_LIMIT_STORAGE_URI)$/
const signatures = [
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{12,}/],
  ['credentialed database URL', /(?:postgres(?:ql)?(?:\+psycopg)?|mysql(?:\+pymysql)?):\/\/[^\s:/]+:[^\s@]+@/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['credentialed Redis URL', /rediss?:\/\/[^\s/]*:[^\s@]+@/],
]

function knownSecrets(env) {
  const needles = new Map()
  for (const [name, value] of Object.entries(env)) {
    if (!secretName.test(name) || !value) continue
    const values = [value]
    if (name.includes('URL') || name.endsWith('_URI')) {
      try {
        values.push(decodeURIComponent(new URL(value).password))
      } catch { /* Malformed URLs are still compared as literal values. */ }
    }
    for (const candidate of values) {
      // Short values have too many accidental matches in generated assets.
      if (candidate.length < 8) continue
      for (const encoded of [candidate, encodeURIComponent(candidate), JSON.stringify(candidate).slice(1, -1)]) {
        needles.set(encoded, name)
      }
    }
  }
  return needles
}

function hasPrivilegedJwt(text) {
  const tokens = text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)
  for (const token of tokens) {
    try {
      const payload = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8'))
      if (payload.role === 'service_role') return true
    } catch { /* Not a JSON JWT payload. */ }
  }
  return false
}

export function scanBuild(directory, env = process.env) {
  const root = resolve(directory)
  if (!statSync(join(root, 'index.html')).isFile()) throw new Error('Missing build entrypoint')
  const needles = knownSecrets(env)
  const findings = []
  let files = 0
  function visit(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name)
      // Never follow links outside the artifact or silently skip their contents.
      if (entry.isSymbolicLink()) throw new Error('Build contains a symbolic link')
      if (entry.isDirectory()) { visit(path); continue }
      if (!entry.isFile()) throw new Error('Unsupported build entry')
      const text = readFileSync(path).toString('utf8')
      files += 1
      const reasons = new Set()
      for (const [label, pattern] of signatures) {
        if (pattern.test(text)) reasons.add(label)
      }
      if (hasPrivilegedJwt(text)) reasons.add('service-role JWT')
      for (const [value, name] of needles) {
        if (text.includes(value)) reasons.add(name)
      }
      // Never return matching contents, snippets, or secret values.
      if (reasons.size) findings.push({ path: relative(root, path), reasons: [...reasons] })
    }
  }
  visit(root)
  return { files, findings }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = scanBuild(fileURLToPath(new URL('../dist', import.meta.url)))
    if (result.findings.length) {
      // Counts/categories only: even a malicious asset filename could contain a secret.
      const reasons = [...new Set(result.findings.flatMap(item => item.reasons))]
      console.error(`Frontend credential check failed: ${result.findings.length} asset(s); ${reasons.join(', ')}.`)
      process.exitCode = 1
    } else {
      console.log(`Frontend credential check passed (${result.files} files; patterns and available environment secrets).`)
    }
  } catch {
    console.error('Frontend credential check could not inspect the complete build. No asset contents or configuration values were logged.')
    process.exitCode = 1
  }
}
