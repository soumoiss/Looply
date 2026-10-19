const PREFERENCE_KEY = "looply_adm_mode";

function preferenceEnabled() {
  try { return localStorage.getItem(PREFERENCE_KEY) === "on"; } catch { return false; }
}

export function getAdminModePreference() { return preferenceEnabled(); }

export function setAdminModePreference(enabled) {
  try { localStorage.setItem(PREFERENCE_KEY, enabled ? "on" : "off"); } catch { /* private browsing */ }
  window.dispatchEvent(new CustomEvent("looply-admin-mode", { detail: { enabled: Boolean(enabled) } }));
}

export function bindAdminModeSync(button, { authorized = false } = {}) {
  if (!button) return () => {};
  const update = (enabled) => {
    const active = Boolean(authorized && enabled);
    button.setAttribute("aria-pressed", String(active));
    button.dataset.active = String(active);
    button.textContent = active ? "ADM ativo" : "Ativar ADM";
    button.title = active ? "Desativar Modo ADM" : "Ativar Modo ADM";
  };
  const apply = () => update(preferenceEnabled());
  const onClick = () => { if (authorized) setAdminModePreference(!preferenceEnabled()); };
  const onStorage = (event) => { if (event.key === PREFERENCE_KEY) apply(); };
  const onMode = (event) => update(event.detail?.enabled === true);
  button.addEventListener("click", onClick);
  window.addEventListener("storage", onStorage);
  window.addEventListener("looply-admin-mode", onMode);
  apply();
  return () => {
    button.removeEventListener("click", onClick);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("looply-admin-mode", onMode);
  };
}

export { PREFERENCE_KEY };
