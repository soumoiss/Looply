import { mountAppPage } from "../../src/page-runtime.js?v=mirrored-global-calls-20261027";
import { applyProfilePreferences } from "../../src/theme.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function settingsMarkup(profile) {
  const theme = profile.theme || "lilas";
  const family = profile.font_family || "system";
  const size = profile.font_size || "normal";
  return `<form class="panel settings-form" data-settings-form>
    <fieldset><legend>Tema</legend><label for="settingsTheme">Aparência</label><select id="settingsTheme" name="theme">
      <option value="lilas" ${theme === "lilas" ? "selected" : ""}>Claro</option>
      <option value="noite" ${theme === "noite" ? "selected" : ""}>Escuro</option>
      <option value="system" ${theme === "system" ? "selected" : ""}>Automático</option>
      <option value="oceano" ${theme === "oceano" ? "selected" : ""}>Oceano</option>
      <option value="rosa" ${theme === "rosa" ? "selected" : ""}>Rosa</option>
      <option value="floresta" ${theme === "floresta" ? "selected" : ""}>Floresta</option>
      <option value="aurora" ${theme === "aurora" ? "selected" : ""}>Aurora</option>
      <option value="coral" ${theme === "coral" ? "selected" : ""}>Coral</option>
      <option value="menta" ${theme === "menta" ? "selected" : ""}>Menta</option>
      <option value="sunset" ${theme === "sunset" ? "selected" : ""}>Pôr do sol</option>
      <option value="grafite" ${theme === "grafite" ? "selected" : ""}>Grafite</option>
    </select></fieldset>
    <fieldset><legend>Texto</legend>
      <label for="settingsFont">Fonte</label><select id="settingsFont" name="font_family">
        <optgroup label="Neutras e modernas">
          <option value="system" ${family === "system" ? "selected" : ""}>Sistema</option>
          <option value="sans" ${family === "sans" ? "selected" : ""}>Arial</option>
          <option value="manrope" ${family === "manrope" ? "selected" : ""}>Manrope · limpa</option>
          <option value="dm_sans" ${family === "dm_sans" ? "selected" : ""}>DM Sans · minimalista</option>
          <option value="jakarta" ${family === "jakarta" ? "selected" : ""}>Plus Jakarta Sans · elegante</option>
          <option value="space_grotesk" ${family === "space_grotesk" ? "selected" : ""}>Space Grotesk · tecnológica</option>
          <option value="montserrat" ${family === "montserrat" ? "selected" : ""}>Montserrat · geométrica</option>
        </optgroup>
        <optgroup label="Arredondadas e leves">
          <option value="rounded" ${family === "rounded" ? "selected" : ""}>Arredondada do sistema</option>
          <option value="nunito" ${family === "nunito" ? "selected" : ""}>Nunito · amigável</option>
          <option value="quicksand" ${family === "quicksand" ? "selected" : ""}>Quicksand · suave</option>
        </optgroup>
        <optgroup label="Serifadas e editoriais">
          <option value="serif" ${family === "serif" ? "selected" : ""}>Serifada do sistema</option>
          <option value="cormorant" ${family === "cormorant" ? "selected" : ""}>Cormorant Garamond · clássica</option>
          <option value="playfair" ${family === "playfair" ? "selected" : ""}>Playfair Display · editorial</option>
          <option value="fraunces" ${family === "fraunces" ? "selected" : ""}>Fraunces · sofisticada</option>
        </optgroup>
        <optgroup label="Expressivas">
          <option value="caveat" ${family === "caveat" ? "selected" : ""}>Caveat · manuscrita</option>
          <option value="syne" ${family === "syne" ? "selected" : ""}>Syne · artística</option>
        </optgroup>
      </select>
      <label for="settingsSize">Tamanho</label><select id="settingsSize" name="font_size">
        <option value="small" ${size === "small" ? "selected" : ""}>Pequeno</option>
        <option value="normal" ${size === "normal" ? "selected" : ""}>Normal</option>
        <option value="large" ${size === "large" ? "selected" : ""}>Grande</option>
        <option value="very_large" ${size === "very_large" ? "selected" : ""}>Muito grande</option>
      </select>
    </fieldset>
    <div class="settings-actions"><button class="primary-button compact-button" type="submit">Salvar preferências</button><span class="form-status" data-settings-status role="status" aria-live="polite"></span></div>
  </form>`;
}

await mountAppPage({ page: "settings", render: async ({ root, client, user, profile }) => {
  root.innerHTML = settingsMarkup(profile);
  const form = root.querySelector("[data-settings-form]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-settings-status]");
    button.disabled = true;
    status.textContent = "Salvando…";
    status.dataset.kind = "info";
    try {
      const values = new FormData(form);
      const updates = {
        theme: String(values.get("theme")),
        font_family: String(values.get("font_family")),
        font_size: String(values.get("font_size"))
      };
      const { data, error } = await client.from("profiles").update(updates).eq("id", user.id)
        .select("theme,font_family,font_size").single();
      if (error) throw error;
      applyProfilePreferences(data);
      status.textContent = "Preferências salvas.";
      status.dataset.kind = "success";
    } catch (error) {
      console.error("Looply preferences update failed", error);
      status.textContent = "Não foi possível salvar. Tente novamente.";
      status.dataset.kind = "error";
    } finally {
      button.disabled = false;
    }
  });
} });
