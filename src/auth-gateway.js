// Isolated auth boundary for the ORIGINAL Looply app.
// Only this adapter needs replacing in a future Auth migration.
// Current provider stays Supabase to preserve user IDs and existing RLS.
export const ACTIVE_AUTH_PROVIDER = "supabase";

export function normalizeLoginIdentity(raw) {
  const identity = String(raw ?? "").trim().toLowerCase();
  if (identity.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
    return { type: "email", value: identity };
  }
  if (/^[a-z0-9_]{3,30}$/.test(identity)) {
    return { type: "username", value: identity };
  }
  throw new Error("invalid_identity");
}

function loginError(code, underlying) {
  const error = new Error(code);
  if (underlying?.status) error.status = underlying.status;
  return error;
}

function isProviderUnavailable(error) {
  const code = Number(error?.context?.status ?? error?.status ?? 0);
  return code === 402 || code >= 500 ||
    ["FunctionsFetchError", "FunctionsRelayError", "AuthRetryableFetchError", "TypeError"].includes(error?.name);
}

async function emailSignIn(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw loginError(error.status === 429 ? "rate_limited" : "invalid_credentials", error);
  if (!data?.session?.access_token) throw loginError("session_not_created");
}

async function usernameSignIn(client, username, password) {
  const { data, error } = await client.functions.invoke("looply-login", {
    body: { username, password }
  });
  if (!error) {
    if (!data?.access_token || !data?.refresh_token) throw loginError("session_not_created");
    const saved = await client.auth.setSession({
      access_token: data.access_token, refresh_token: data.refresh_token
    });
    if (saved.error || !saved.data?.session?.access_token) throw loginError("session_not_created", saved.error);
    return;
  }
  if (!isProviderUnavailable(error)) {
    throw loginError(Number(error?.context?.status) === 429 ? "rate_limited" : "invalid_credentials", error);
  }
  // Preserve the existing project's password-verified fallback.
  const result = await client.rpc("looply_login_fallback", {
    p_username: username, p_password: password
  });
  if (result.error || typeof result.data !== "string" || !result.data) {
    throw loginError("login_unavailable", result.error || error);
  }
  await emailSignIn(client, result.data, password);
}

export async function authenticateOriginalAccount(client, rawIdentity, password) {
  if (!client) throw loginError("provider_unavailable");
  const identity = normalizeLoginIdentity(rawIdentity);
  if (typeof password !== "string" || password.length === 0 || password.length > 256) {
    throw loginError("invalid_credentials");
  }
  if (identity.type === "email") await emailSignIn(client, identity.value, password);
  else await usernameSignIn(client, identity.value, password);

  // Do not trust a client-provided profile ID. Validate the Auth identity on the server.
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  if (error || !user?.id) throw loginError("session_not_created", error);
  const result = await client.from("profiles")
    .select("id,username,display_name,bio,profile_visibility")
    .eq("id", user.id).maybeSingle();
  if (result.error || !result.data || result.data.id !== user.id) {
    throw loginError("profile_unavailable", result.error);
  }
  return {
    id: result.data.id,
    username: result.data.username,
    displayName: result.data.display_name || result.data.username,
    bio: result.data.bio || ""
  };
}
