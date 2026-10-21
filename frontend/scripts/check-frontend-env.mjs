// The browser talks to FastAPI. Database, Storage and authentication settings
// belong to the API project, even when a platform would not expose them to Vite.
const serverSetting = /^(?:(?:VITE_|NEXT_PUBLIC_)?(?:DATABASE_URL|POSTGRES(?:_[A-Z0-9_]+)?|SUPABASE(?:_[A-Z0-9_]+)?|JWT_SECRET_KEY|LIBRARIAN_AUTH_CODE|ENTRY_STATION_PIN|RATE_LIMIT_(?:STORAGE_URI|REQUIRE_SHARED))|(?:[A-Z0-9]+_)*(?:REDIS_URL|KV_URL|KV_REST_API_(?:URL|TOKEN|READ_ONLY_TOKEN)))$/i

export function serverEnvironmentNames(environment) {
  return Object.keys(environment).filter(name => serverSetting.test(name)).sort()
}

export function assertFrontendEnvironment(environment) {
  const names = serverEnvironmentNames(environment)
  if (names.length) {
    // Report configuration names only, including empty entries so a resource
    // connection cannot be left in place with temporarily blank credentials.
    throw new Error(`Frontend build refused server configuration: ${names.join(', ')}. Disconnect it from the frontend project; keep the API configuration.`)
  }
}
