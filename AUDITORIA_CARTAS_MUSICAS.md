# AUDITORIA_CARTAS_MUSICAS.md
**Data:** 2026-10-27 | **Código:** `soumoiss/Looply` | **Infra ativa:** Neon PostgreSQL, autenticação Neon, Cloudflare para mídia e serviços auxiliares.

## Escopo e fonte de verdade
A referência visual `Looply App.html` enviada nesta conversa NÃO é um cliente Neon. Nos seus trechos de JavaScript (linhas ~508–675), `currentUser`, `usuariosApp`, `cartasDB` e `musicasDB` são arrays locais. As 37 cartas e 9 músicas adicionais são geradas com `for` (linhas ~597–672). `executarEnvioCarta` realiza apenas `cartasDB.unshift` (linhas ~854–894); `executarDedicatoria` não faz POST (linhas ~1045–1051); `toggleMiniPlayerPlay` troca só o ícone (linhas ~973–981). Por isso a referência foi usada para **interface**, nunca para criar registros fictícios.

### Dados conferidos por SELECT no Neon (projeto `looply-v3-migration` / `small-scene-81115187`)
- `public.archived_cards`: **97**; 47 para `misol`, 42 para `patati` (nome exibido Bielzinho), 8 para `yara`.
- `public.archived_card_reads`: **5 leituras** associadas às 42 cartas do usuário `patati`.
- `public.community_letters`: **7 cartas**; `public.music_dedications`: **6 dedicatórias**.
- `public.music_library`: **0 músicas**. Não afirmar que há 14 faixas do Neon; playlists do YouTube são tratadas separadamente e precisam da API oficial.
- Existe 1 carta arquivada protegida em `misol`, com corpo NULL. A função de desbloqueio do adaptador antigo `looply-admin` está indisponível na versão Neon; sua leitura **não está validada**.
- Não há projeto Supabase novo, seed falso nem reescrita do acervo histórico.

## Constatações por arquivo, causa e solução
| Componente | Origem auditada | Problema | Correção realizada |
|---|---|---|---|
| Boot/estado de Cartas | `cartas.html`, `assets/js/letters.js` linhas ~1–74, `src/page-runtime.js` linhas ~143–209 | Os dados dependiam do boot de autenticação e do compositor legado; carregamento tardio confundia o usuário | UI de Cartas reconstruída em `assets/js/letters.js`, renderização depois de `mountAppPage`; reconsulta do Neon após operações |
| Envio de carta | `src/letters-community.js` linhas ~480–518 | Persistência real já existia em `community_letters`, mas estava atrás da interface legada; exemplo anexado era só array | Compositor novo com seleção de conta, proteção criptográfica, `INSERT ... RETURNING id` via Neon Data API e recarregamento sem F5 |
| Arquivo original | `src/archived-cards.js` linhas ~39–260 | 97 cartas estão em `archived_cards`, não numa tabela nova `cartas`; progresso em `archived_card_reads` | Reutilizados SELECT, botão de abrir e upsert de leitura no Neon, mantendo a coleção real de 42 para `patati` |
| Filtros | `assets/js/letters.js` antigo linhas ~32–46; `src/letters-community.js` linhas ~120–130 | Coleções exibidas em painéis separados; filtros sem layout desejado | Nova barra de recebidas, enviadas, originais, data e sem data; consulta Neon com autorização RLS, depois seleção/filtragem dos registros carregados (NÃO é filtro SQL separado por botão) |
| Administração Cartas | `src/letters-community.js` linhas ~315–465; `src/neon-production-client.js` linhas ~174–214 | A chamada anterior `functions.invoke("looply-admin")` encontra adaptador que não suporta esta função | Consultas, edição e exclusão pela Data API com `v3_self_is_admin` e políticas PostgreSQL RLS; não há superpoder de ler carta criptografada sem senha |
| Lista e player Músicas | `assets/js/music.js` linhas 1–22 e `src/youtube-playlist.js` ~155–337 | Lista depende de YouTube API e da configuração no servidor; player existente já usava iframe interno | Interface preservada, reprodução em iframe já existente mantida, pesquisa de lista existente mantida; atalhos opcionais externos não substituem o botão Play |
| Busca e dedicação | `src/music.js` ~380–785; `src/story-music-catalog.js` | Referência anexada fazia busca falsa e não persistia dedicatória | Mantido catálogo oficial e `INSERT` Neon em `music_dedications` do módulo real existente |
| Comentários por faixa | `src/youtube-playlist.js` ~255–337 | Histórico antigo em `music_page_comments`; novas notas exigem isolamento por vídeo/usuário | Comentários públicos em `music_track_comments` por `youtube:<videoId>`, histórico legado preservado, notas de ADM isoladas em tabela RLS `admin_music_track_comments` |
| Administração Músicas | `src/music-admin-playlists.js` antigo ~1–130 | Dependia de `looply-admin` não exposto pelo adaptador Neon | Painel exclusivo com role conferida, busca usuários reais/avatares, player incorporado, `INSERT` privado auditável por RLS |
| Rotas curtas | `scripts/build.mjs` e GitHub Pages | URLs `/car` e `/mu` não tinham arquivos index próprios na pasta de saída | Adicionados `car/index.html`, `mu/index.html` e cópia no build, redirecionando para `cartas.html` e `musicas.html` |

## Segurança e limites
- `src/neon-rest-bridge.js`: whitelist explícita de operações; JWT Neon transmitido à Data API, RLS PostgreSQL decide acesso. **Nenhum segredo do Neon, Supabase, YouTube ou Cloudflare foi incluído.**
- Migração aditiva `migration/20261027_cartas_musicas_adm_rls.sql` **aplicada ao Neon**, e políticas confirmadas por `pg_policies`. Admin não é detectado por string do username nem flag enviada pelo navegador.
- GitHub Pages entrega arquivos estáticos e **não executa Cloudflare Pages Functions**; a arquitetura já implantada é Neon Data API com JWT/RLS. Não foram criados endpoints `/api/cartas` fictícios que falhariam no Pages.
- Administração de cartas arquivadas protegidas, leitura da única carta legada com corpo NULL, migração de mídia ausente e teste em Android autenticado requerem auditoria própria; não declarar 100% dessas funções sem evidência.
- A edição de carta arquivada antiga não oferece campo de título próprio, pois o esquema usa `body`/número e não possui coluna `titulo`. A edição de novas cartas usa `subject`.

## Evidência de qualidade disponível
- GitHub Actions `Verify Looply`: build e testes de contratos executados na branch; consultar `QA_REPORT_CARTAS_MUSICAS.md` para resultado exato.
- Neon: SELECT da estrutura e contagens e SELECT de `pg_policies`; sem exclusões nem mudanças destrutivas de dados anteriores.
- A verificação E2E com credenciais dos perfis, tocando áudio de plataforma externa em Android, não pode ser inferida de teste estático nem de uma consulta SQL.
