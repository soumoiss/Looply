// Consistent and safe login diagnostics for Neon Auth and profile lookups.
// A failed backend request is NEVER proof that the user's password is invalid.
export function classifyNeonLoginFailure(error, { authenticated = false } = {}) {
  const status = Number(error?.status ?? error?.context?.status ?? error?.response?.status ?? 0);
  const detail = [
    error?.message, error?.code, error?.name, error?.cause?.message,
    error?.context?.message, error?.error?.message
  ].filter(Boolean).join(" ").toLowerCase();
  if (status === 402 || /quota|usage.limit|exceeded.*limit|exceeded.*transfer|53000|generic_quota_exceeded/.test(detail)) {
    return { kind: "service_quota", message: "O serviço de contas está temporariamente indisponível. Seus dados de login não foram rejeitados. Tente novamente mais tarde." };
  }
  if (status === 429 || /too_many_requests|rate.limit/.test(detail)) {
    return { kind: "rate_limited", message: "Muitas tentativas de acesso. Aguarde um pouco antes de tentar novamente." };
  }
  if (/looply_ip_blocked/.test(detail)) {
    return { kind: "network_blocked", message: "Acesso bloqueado para esta rede." };
  }
  if (authenticated || /profile[_ -]unavailable|perfil|v3_self_profile|profile[_ -]not[_ -]owned/.test(detail)) {
    return { kind: "profile_unavailable", message: "A conta foi autenticada, mas não foi possível carregar o perfil. Tente novamente quando o serviço estiver disponível." };
  }
  // Only a provider-confirmed, explicit password rejection is reported as such.
  if ((status === 400 || status === 401 || status === 403 || status === 422)
      && /invalid[_ -]?(?:email[_ -]?or[_ -]?password|credentials|password|login)|incorrect[_ -]?password|invalid_username_or_password|email or password|wrong password|usuário ou senha incorretos/.test(detail)) {
    return { kind: "invalid_credentials", message: "Usuário ou senha incorretos." };
  }
  return { kind: "service_unavailable", message: "Não foi possível conectar ao serviço de contas. Verifique sua conexão e tente novamente." };
}
