// Read-only production diagnostics. Uses public configuration only; never submits credentials.
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../config.js', import.meta.url), 'utf8');
const base = config.match(/supabaseUrl:\s*"(https:\/\/[a-z0-9]+\.supabase\.co)"/)?.[1];
const key = config.match(/publishableKey:\s*"(sb_publishable_[\w-]+)"/)?.[1];
if (!base || !key) throw new Error('Missing public Supabase configuration');
const endpoints = [
  ['auth', '/auth/v1/health', 'GET'],
  ['data', '/rest/v1/profiles?select=id&limit=0', 'GET'],
  ['login_function', '/functions/v1/looply-login', 'OPTIONS'],
  ['storage', '/storage/v1/version', 'GET']
];
const checks = await Promise.all(endpoints.map(async ([service, path, method]) => {
  try {
    const response = await fetch(base + path, {
      method, headers: { apikey: key }, signal: AbortSignal.timeout(15_000)
    });
    const body = await response.text();
    return { service, status: response.status,
      restriction: [...new Set(body.match(/exceed(?:ed)?_[a-z_]+|overdue_payment/g) || [])] };
  } catch {
    return { service, status: 0, error: 'network_or_timeout' };
  }
}));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), project: new URL(base).hostname, checks }, null, 2));
process.exitCode = checks.some((check) => check.status === 402) ? 2 :
  checks.some((check) => check.status < 200 || check.status >= 300) ? 1 : 0;
