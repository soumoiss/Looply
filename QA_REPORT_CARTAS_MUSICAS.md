# QA_REPORT_CARTAS_MUSICAS.md
**Data:** 2026-10-27. Escopo: novo layout de Cartas e correções funcionais de Músicas sem redesenho da aba.

## Estado das verificações
Os testes de Node/GitHub Actions verificam contratos e regressões de código; **não** são sessões reais de usuários no navegador. Resultado registrado após atualizar os contratos do novo layout: **501 testes de repositório aprovados, 0 reprovados** na branch `fix/cartas-musicas-real` (run `40536368730`; as alterações de rotas e CSS subsequentes exigem verificação de workflow posterior). O build inclui `cartas.html`, `musicas.html`, assets e rotas `/car` e `/mu`.

### Matriz de 30 verificações
`PASS-C` = verificado pelo código/testes automatizados ou consulta read-only Neon; `PENDENTE-E2E` = exige sessão autenticada, navegador real, ação persistente ou prova visual móvel. Ausência de evidência **não** é aprovação.

| # | Cenário | Estado | Evidência / observação |
|---|---|---|---|
| 01 | HTML substitui hero antigo de Cartas | PASS-C | `cartas.html` + `assets/js/letters.js` |
| 02 | Cards retro com bordas e listras | PASS-C | `assets/css/pages/letters.css` |
| 03 | Seção escrever carta e FAB | PASS-C | Seletor `#btnEscrever` e handler |
| 04 | Modal de edição responsivo no CSS | PASS-C | `#modalEscrever`, `modal-carta` |
| 05 | Picker visual com avatar e username | PASS-C | `signProfileAvatars` / `#listaUsuarios` |
| 06 | Validação título, texto, pessoa | PASS-C | Handler `cartaComposeForm` |
| 07 | Proteção criptográfica de carta nova | PASS-C | `sealLetter`; testes de round trip |
| 08 | INSERT verdadeiro de carta autenticada | PENDENTE-E2E | Precisa de sessão de remetente e SELECT pós-envio |
| 09 | Atualizar carta enviada sem F5 | PENDENTE-E2E | Há `loadCurrent()` após INSERT; validar render em navegador |
| 10 | Filtro recebidas | PASS-C | `recipient_id` do perfil autenticado, RLS |
| 11 | Filtro enviadas | PASS-C | `sender_id` do perfil autenticado, RLS |
| 12 | Filtro originais | PASS-C | Neon `archived_cards`, consulta por destinatário |
| 13 | Existe coleção de 42 cartas | PASS-C | SELECT Neon para `patati` = 42 |
| 14 | Total de 5 lidas no arquivo de 42 | PASS-C | SELECT Neon `archived_card_reads` = 5 |
| 15 | Marcação ao abrir uma carta | PENDENTE-E2E | `src/archived-cards.js` grava recibo; falta teste pós-click |
| 16 | Subfiltro Todas/Sem data | PASS-C | `state.sub` e filtro em dados recuperados |
| 17 | Data/Limpar data | PASS-C | date picker e handler |
| 18 | ADM consulta 47 cartas Misol | PASS-C | SELECT Neon 47 e RLS admin SELECT |
| 19 | ADM consulta arquivo de 42 Bielzinho | PASS-C | SELECT Neon 42 e RLS admin SELECT |
| 20 | ADM altera/exclui cartas via backend | PENDENTE-E2E | SQL RLS aplicado; requer sessão ADMIN e operação controlada |
| 21 | Abertura de carta legada protegida | PENDENTE-E2E | Existe 1 arquivo protegido com body NULL; ver `AUDITORIA` |
| 22 | Músicas mantém HTML/CSS anterior | PASS-C | `musicas.html` e `assets/css/pages/music.css` não foram modificados |
| 23 | YouTube player interno | PASS-C | iframe `youtube-nocookie.com/embed` no código; player depende do provedor |
| 24 | Áudio tocando no Android sem sair | PENDENTE-E2E | Exige YouTube/áudio real e navegador Android |
| 25 | Busca de playlist por título | PASS-C | `src/youtube-playlist.js`, filtro de título e canal |
| 26 | Seleção de faixa com catálogo real | PASS-C | `searchStorySongs`, testes do módulo |
| 27 | Dedicatória POST Neon para destinatário | PENDENTE-E2E | Código em `src/music.js` usa `music_dedications`; falta sessão para confirmação |
| 28 | Comentário por música na tabela correta | PENDENTE-E2E | Inserção `music_track_comments` implementada; confirmar com perfil real |
| 29 | Nota privada ADM visível só ao dono | PASS-C | RLS `admin_music_track_comments` verificada; teste usuário autenticado ainda pendente |
| 30 | Larguras Android 320/360/390/428 sem cortes | PENDENTE-E2E | CSS mobile criado; não houve screenshot com conta autenticada |

## Evidência SQL (leituras não destrutivas)
```sql
SELECT COUNT(*) FROM public.archived_cards; -- 97
SELECT COUNT(*) FROM public.community_letters; -- 7
SELECT COUNT(*) FROM public.music_dedications; -- 6
SELECT COUNT(*) FROM public.music_library; -- 0
SELECT username,COUNT(*) FROM public.profiles p
LEFT JOIN public.archived_cards c ON c.recipient_id=p.id
GROUP BY username; -- misol 47, patati 42, yara 8, demais 0
SELECT tablename,policyname,cmd FROM pg_policies
WHERE schemaname='public' AND policyname LIKE 'looply_v6_%';
```

**Pendências que impedem declarar 100% validado:** testes reais com duas sessões, recepção de carta e leitura; teste visual do Android com captura; INSERT/SELECT/DELETE controlado com usuário autenticado; reprodução de uma faixa embutida permitida pelo YouTube; acesso a mídia legada protegida sem conteúdo na tabela atual. Não afirmar resultado 30/30 PASS enquanto faltar evidência.
