# Looply · Prompt 04 — Entrada, login e estados de acesso

Data: 2026-11-01. Branch: `ux/login-access-looply-20261101`. Baseline `main@521b4ed5e3520a9ce3f8e440af0a59c754cc6dab`.

## Escopo e referência
A tela pública real está em `login.html`; seu estilo vem de `assets/css/app.css` e `assets/css/login.css`; `assets/js/login.js` apenas importa `src/login.js`. A aplicação do tema ocorre em `src/theme-bootstrap.js`/`src/theme.js`. A entrada splash está em `index.html` e `src/splash.js`. Nenhum dos documentos HTML, scripts, módulos de autenticação ou componentes de infraestrutura foi editado.

A correspondência criptográfica exata entre o APK EXTRA 3.0.4 usado pelo usuário e a origem da branch ainda **não foi demonstrada**, pois o binário exato não está disponível. O APK é intocável.

## Componentes e textos originais preservados

| Elemento/estado | Referência imutável | Operação |
|---|---|---|
| Marca/ícone circular animado | `.login-logo`, `.circle`, `.login-brand-name` | CSS original mantido; sem trocar o símbolo, Cabin Sketch, Quillen ou marca |
| Apresentação | `.login-brand-subtitle` | `Cartas aos amigos ;)` |
| Usuário | `#loginForm #username` | `Quem és?`, `autocomplete=username` |
| Segredo | `#password`, `#togglePassword`, `#eyeIcon` | `código secreto`, botão mostrar/ocultar |
| Recuperação | `.forgot a` | link externo original via WhatsApp, nova aba |
| Entrada | `#loginButton` | `Avante!`, Enter e callback de submit intactos |
| Feedback | `#message`, `.form-message.show`, `[data-kind]` | erros reais do JavaScript continuam exibidos |
| Convite/ativação | `#invitePasswordForm`, `#inviteNewPassword`, `#inviteConfirmPassword`, `#inviteMessage` | criação e confirmação com validação de 12–256 caracteres |
| Redirecionamento | `src/login.js` | `home.html` ou `next` validado, sem mudanças |

O fluxo verdadeiro é *username + password*. O login **não exige e-mail visível**. A lógica de autenticação, convite, rate limiting, sessão, fallback, mensagens de erro e endpoint não foi editada.

## Diagnóstico antes

- O cartão utiliza a identidade original (lilás, roxo, branco, logo circular e lettering Cabin Sketch), mas a regra `.login-page` era predominantemente um bloco de fluxo normal; `min-height:100dvh` havia sido acrescentado previamente, sem alinhamento vertical consistente.
- Havia configurações sobrepostas em `app.css` e `login.css` para altura de campo e botão: 54px na base, 46px no refinamento anterior.
- O botão mostrar senha possuía dimensão base 40×40px, abaixo da meta de 44px.
- O posicionamento do conteúdo em área curta/teclado precisava de regra conservadora que não dependa de Javascript e não bloqueie rolagem.
- A mensagem de erro já tinha ocultamento condicional por `.show` e sucesso por `[data-kind=success]`: são estados funcionais preservados.

## Proposta aplicada (somente apresentação)

**Arquivo alterado:** apenas `assets/css/login.css`.

1. `.login-page`: grid vertical alinhada ao centro em telas altas, `min-height:100dvh` e padding respeitando `safe-area-inset-top/bottom`. Em viewports com altura até 680px, alinhamento no topo em vez de centralização; não há `height` fixa nem `overflow:hidden`.
2. `.login-card`: largura contida, padding fluido e borda usando a linha existente; marca e dimensões do símbolo preservadas.
3. Campos: largura 100%, altura mínima de 52px e fonte de 16px para evitar zoom automático em dispositivos móveis; foco via cor atual do tema; campo de senha com padding direito suficiente para o botão.
4. `#togglePassword` (classe `.toggle-password`): área 44×44px, estado `aria-pressed=true` visual usando tokens existentes; evento `click` não foi modificado.
5. Link de recuperação: alvo mínimo 44px, sem mudar URL nem `target`.
6. CTA `Avante!`/ativação: mínimo de 52px; cores, estados disabled e transições existentes preservados.
7. Mensagens visíveis (`.form-message.show`): alinhamento de leitura, contorno discreto com `--danger` ou `--primary` para sucesso; nenhum texto substituído ou suprimido.
8. Larguras pequenas (390 e 340px) e altura curta (680px): ajustes locais; sem CSS universal que altere formulário noutros módulos. `prefers-reduced-motion` respeitado.

**Diff orientado:** acréscimo ao final de um único CSS, sem substituições ou supressões; `login.html`, `assets/js/login.js`, `src/login.js`, `src/theme.js`, `src/theme-bootstrap.js`, `index.html`, `src/splash.js` intactos. Nenhum valor hex de cor ou fonte identitária foi introduzido.

## Capturas de comparação

São capturas do **login público** em resolução controlada. Os links "depois" foram gerados injetando a exata adição CSS da branch no site público, sem deploy: **não demonstram autenticação nem WebView real**.

| Largura | Antes (main pública) | Depois (CSS da branch, simulado sobre site) |
|---:|---|---|
| 320 | https://hcti.io/v1/image/01a19878-bbca-70f7-9ca0-8deacb2897e4.png | https://hcti.io/v1/image/01a1987a-7708-7513-97cc-3c77779787fb.png |
| 360 | https://hcti.io/v1/image/01a19878-c597-7a6a-ac7c-66f2cb5d40f5.png | https://hcti.io/v1/image/01a1987a-7efb-7569-9f53-7bc4b35b1077.png |
| 390 | https://hcti.io/v1/image/01a19878-cec8-7071-aca7-7f010fff145c.png | https://hcti.io/v1/image/01a1987a-871f-75be-9676-342eef6b0d7d.png |
| 428 | https://hcti.io/v1/image/01a19878-d6c7-7027-b571-65c38a31d0a5.png | https://hcti.io/v1/image/01a1987a-8f69-7e2b-8c6d-19fe683f106b.png |
| 768 | https://hcti.io/v1/image/01a19878-df6a-75c2-a458-3e69448f47db.png | https://hcti.io/v1/image/01a1987a-9d5e-797b-a454-6875d87c4fb9.png |
| 1024 | https://hcti.io/v1/image/01a19878-e70b-7528-8e99-f6285b95295a.png | https://hcti.io/v1/image/01a1987a-a599-7ab6-9670-4d60a9404ed2.png |

## Testes, riscos e limites

- O teste de escopo deve confirmar diff de **um único CSS** e nenhum campo `id`, data-attribute, callback, import, sessão, autenticação ou contrato de rede alterado.
- Capturas nas seis larguras geradas com sucesso. A imagem renderizada demonstra o CSS aplicado, mas não certifica automaticamente ausência de recortes/defeitos e não substitui inspeção visual humana.
- Preferência dark/temas por perfil: CSS exclusivamente referenciado por `var(--...)`; ainda não há captura real autenticada do tema `noite` nem contraste manual testado para os 10 temas.
- Testes funcionais de credenciais reais, convite válido, endpoint, recuperação de senha por WhatsApp, WebView com teclado nativo, safe area real, foco com leitor de tela e outros fluxos de autenticação: **NÃO VERIFICADOS** (não realizar login com contas reais para testar UI CSS).
- A `main` não foi alterada. O APK 3.0.4 e o backend Neon/Auth, Cloudflare Workers/R2, FCM e Android permaneceram **intocados**.

## Reversão

Excluir a branch `ux/login-access-looply-20261101` ou reverter seu commit CSS. Enquanto não houver merge, `main` e o site publicado permanecem no estado anterior.
