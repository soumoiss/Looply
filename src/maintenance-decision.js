// Authenticated maintenance authorization, independent of the beta Neon JS RPC
// serializer. The Data API must receive the actual Neon bearer token.
function unwrapRpc(value, functionName) {
  if (Array.isArray(value)) value = value.length === 1 ? value[0] : null;
  if (value && typeof value === "object" && Object.hasOwn(value, functionName)) {
    value = value[functionName];
  }
  if (typeof value === "string" && value.startsWith("{")) {
    try { value = JSON.parse(value); } catch { /* Invalid RPC response */ }
  }
  return value;
}

export async function evaluateMaintenanceAccess({ session, dataApiUrl, fetchImpl = fetch }) {
  const token = String(session?.access_token || "").trim();
  if (!token) throw new Error("maintenance_session_missing");
  const base = String(dataApiUrl || "").replace(/\/$/, "");
  if (!base.startsWith("https://")) throw new Error("maintenance_api_missing");
  const headers = {
    authorization: "Bearer " + token,
    accept: "application/json"
  };
  async function query(path, options = {}) {
    const response = await fetchImpl(base + path, {
      method: options.method || "GET",
      cache: "no-store",
      headers: {
        ...headers,
        ...(options.method === "POST" ? { "content-type": "application/json" } : {})
      },
      ...(options.method === "POST" ? { body: "{}" } : {})
    });
    if (!response.ok) throw new Error("maintenance_api_http_" + response.status);
    return response.json();
  }
  const rpc = async name => unwrapRpc(await query("/rpc/" + name, { method: "POST" }), name);
  // An explicit, server-authoritative maintenance decision takes precedence.
  let status = null;
  try {
    const value = await rpc("looply_maintenance_status");
    if (value && typeof value.enabled === "boolean"
      && typeof value.blocked === "boolean" && typeof value.exempt === "boolean") {
      status = value;
      if (!status.blocked) return { allowed: true, verifiedAdmin: status.exempt };
    }
  } catch { /* Fall back to separately exposed server-side authorization. */ }

  // A failed status RPC must not falsely lock out *everyone* when the actual
  // app_settings record explicitly says that maintenance is disabled.
  if (!status) {
    try {
      const rows = await query("/app_settings?select=maintenance_mode&id=eq.1&limit=1");
      if (Array.isArray(rows) && rows.length === 1) {
        if (rows[0]?.maintenance_mode === false) return { allowed: true, verifiedAdmin: false };
        if (rows[0]?.maintenance_mode === true) status = { enabled: true, blocked: true, exempt: false };
      }
    } catch { /* Continue checking the independent Peixinho identity. */ }
  }

  // This PostgreSQL function requires *both* an active Neon admin account and
  // the verified link to the original Peixinho profile.
  try {
    const bypass = await rpc("looply_maintenance_admin_bypass");
    if (bypass === true || bypass === "true") return { allowed: true, verifiedAdmin: true };
  } catch { /* Also check the two legacy, independently authorized endpoints. */ }

  // Compatibility path for versions of the Data API where the maintenance RPC
  // is absent from its schema cache: check actual admin role and own profile.
  try {
    const isAdmin = await rpc("v3_self_is_admin");
    if (isAdmin === true || isAdmin === "true") {
      const profiles = await query("/v3_self_profile?select=username&limit=2");
      if (Array.isArray(profiles) && profiles.length === 1
        && String(profiles[0]?.username || "").trim().toLowerCase() === "peixinho") {
        return { allowed: true, verifiedAdmin: true };
      }
    }
  } catch { /* No unverified/local admin fallback. */ }
  if (status?.blocked === true) return { allowed: false, verifiedAdmin: false };
  throw new Error("maintenance_verification_unavailable");
}
