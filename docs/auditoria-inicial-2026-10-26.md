# Auditoria técnica inicial do Looply

Data da auditoria: 2026-10-26  
Escopo desta etapa: fluxo de Stories, enquadramento de mídia, seleção de música, permissões administrativas e implantação Neon/Cloudflare. A auditoria continua; este registro não declara o aplicativo inteiro concluído.

## Registro de achados

| Área | Evidência observada | Causa confirmada ou provável | Ação / estado | Verificação |
|---|---|---|---|---|
| Seletor musical de Stories | Selecionar faixas de catálogo acionava o seletor de arquivos do dispositivo | O fluxo do seletor tratava a faixa comercial escolhida como se o usuário fosse adicionar um arquivo local | Corrigido no PR #135: seleção do catálogo permanece dentro do aplicativo; áudio próprio é uma ação separada | 362 testes passaram no CI, incluindo testes do catálogo e do editor |
| Áudio comercial de Stories | Resultados Apple Music/Deezer fornecem metadados/prévia, mas não autorização para incorporar a faixa completa ao Story | A prévia de catálogo não equivale a licença de sincronização/publicação | A interface informa a limitação e não gera um Story silencioso fingindo que o áudio foi anexado; publicação continua limitada a fontes compatíveis/autorizadas | Testes automatizados de fluxo de áudio e busca ao vivo passaram; ainda falta um teste autenticado de publicação em conta/dispositivo |
| Enquadramento de Stories | Exportações transformadas usavam composição de cobertura, cortando conteúdo para 9:16; editor usava `object-fit: cover` | O mesmo tratamento de corte era aplicado independentemente da proporção original | Corrigido no PR #135: saída vertical 9:16 com fundo complementar e mídia integral em escala `contain`; editor preserva conteúdo sem zoom automático | Testes do editor e validação especializada de mídia passaram no CI |
| Mensagens de falha | Algumas mensagens técnicas do editor podiam ser expostas ao usuário comum | Erros eram repassados sem distinção de nível de acesso | Corrigido no PR #135 com mensagens breves para usuário comum; diagnóstico técnico continua reservado ao administrador | Suíte do editor passou |
| Ações administrativas | Controllers chamam `functions.invoke("looply-admin")` para ações protegidas. O adaptador ativo só implementa `looply-chat` e retorna bloqueio para outros nomes | Migração parcial: `looply-admin` ainda não foi portado para uma rota Neon/Cloudflare ativa | Bloqueio confirmado. Não substituído por autorização no cliente nem reativado via Supabase. Correção depende de endpoint de servidor autenticado, com validação de papel e regras por recurso | SQL de leitura confirmou que `v3_self_is_admin()` deriva o papel da sessão Neon. Tentativa de ação permanece fail-closed no adaptador |
| Infraestrutura de produção e migração | O código de páginas usa o adaptador Neon. O gateway Cloudflare encontrado declara modo somente leitura e paridade incompleta; os Workers consultados têm identificação de staging | O corte total de backend para Neon/Cloudflare não terminou | Limitação registrada. Não foi feita alteração de banco ou implantação de Worker, pois não há rota de escrita/admin em produção cuja autorização e compatibilidade possam ser verificadas | Inventário somente leitura de projetos, branches, função Neon `looplystorage` e Workers; projeto ativo identificado pelo hostname da configuração |
| Teste visual autenticado | O endereço público encaminha visitantes sem sessão para login | Não havia sessão de teste fornecida no navegador | Validação autenticada de UI permanece pendente; não foram usadas credenciais de terceiros | Navegação pública alcançou a página de login |

## Etapa publicada

A correção inicial de Stories foi mesclada na branch principal pelo commit `eed496bf4e21fa6b181d27eae17567d1341f486f` (PR #135). O workflow do GitHub Pages terminou com sucesso. A página pública respondeu e encaminhou a visita sem sessão para o login.

## Próximos bloqueios técnicos

1. Portar ações administrativas para uma rota de servidor ativa que valide JWT Neon e autorização por recurso antes de qualquer mutação.
2. Confirmar qual implantação de backend é a origem de verdade; os Workers Cloudflare auditados são staging/read-only e o app ainda mantém migração incompleta.
3. Só então retomar Stories com menções/republicação e operações sociais, preservando privacidade e sem usar chamadas simuladas.
4. Retestar as alterações de Stories com uma conta de teste autenticada e um arquivo publicado real, incluindo inspeção da trilha de áudio.

## Integridade de dados

As consultas realizadas na infraestrutura foram de leitura. Nenhuma tabela ou branch de dados foi apagada, reiniciada ou recriada nesta auditoria.


## Complemento: permissões verificadas no Neon

Consulta somente leitura a `pg_policies` e `pg_proc` na branch principal do projeto configurado no aplicativo:

- As policies de `posts`, `stories` e `comments` permitem exclusão pelo respectivo autor (mapeado por `looply_legacy_uid()`). Não há policy de exclusão administrativa direta nessas tabelas.
- `archived_cards`, `community_letters`, `conversations`, `story_media` e várias tabelas de interação não expõem policies de mutação ampla; alguns caminhos usam RPCs específicos.
- As RPCs publicadas com prefixo `v3_`/`v4_` cobrem leitura/visibilidade, perfil, seleção de publicações, mídia pendente e criação/listagem de conversas. Não foi encontrada uma RPC ativa de moderação ou exclusão administrativa.
- A função antiga `looply-admin` fazia limpeza coordenada de objetos S3 além de apagar registros e gravar auditoria. O caminho de armazenamento ativo valida posse do objeto e não contém a permissão administrativa correspondente.

Resultado: os controles existentes são fail-closed para chamadas administrativas pelo adaptador Neon. A ausência de uma rota não deve ser resolvida com exclusão direta pelo navegador: isso deixaria objetos de mídia órfãos e omitiria auditoria. A implementação requer um endpoint server-side portado e validado, com autorização por sessão, registro de auditoria e limpeza coordenada de mídia.

A análise não executou DELETE, UPDATE, INSERT nem chamadas autenticadas que alterassem dados.


## Reavaliação do prompt mestre — 2026-10-26

Esta atualização compara o escopo integral do prompt com alterações efetivamente integradas, testes disponíveis e limitações observadas.

### Concluído ou integrado

| Área | Alteração verificável | Limite atual |
|---|---|---|
| Música e enquadramento de Stories | PR #135 manteve a busca musical no app; não abre a galeria ao escolher catálogo. A captura/exportação foi ajustada para 9:16, sem zoom automático, preservando fontes incompatíveis com fundo complementar. PR #142 corrigiu a geometria de captura frontal/traseira e lentes. | A publicação autenticada com arquivo real ainda não foi exercitada numa conta/dispositivo do proprietário. Catálogos comerciais continuam sem autorização para incorporar a música inteira. |
| Proteção administrativa | PR #139 removeu identidade administrativa codificada em Cartas e consulta o papel autenticado no Neon. Os controllers continuam fechando operações cujo endpoint administrativo ainda não foi migrado. | Ainda falta portar as operações administrativas para um endpoint Neon/Cloudflare ativo, com autorização por recurso. |
| Chat e Galeria | PR #138 corrigiu filtros de conversas pela categoria e estado de leitura. PR #140 reorganizou os seis controles da Galeria em 3 × 2. | A confirmação autenticada de contas distintas ainda não ocorreu. |
| Cartas arquivadas | PR #141 preserva as cartas exibidas quando falha a consulta de recibos de leitura e desativa ações dependentes do dado indisponível. | O carregamento principal de cartas ainda apresenta erro de acesso em algumas contas; a exibição parcial não resolve a consulta nem a edição completa. |
| Menções em Stories e notificações | PR #143 adicionou seletor com pesquisa/avatar, IDs persistidos, RPC que valida autoria/expiração/privacidade, notificação deduplicada e link para o Story. A migração foi testada numa branch Neon de auditoria e aplicada ao branch principal. As concessões foram verificadas: inserção direta de menção/notificação negada e atualização do campo de leitura restrita ao destinatário. | Falta exercitar o fluxo em duas contas autenticadas e confirmar notificação e abertura do Story no navegador da aplicação. Republicação de Stories ainda não está implementada. |
| Publicação | PRs #135–#143 foram integradas. Os arquivos de Stories da PR #143 foram observados servidos no GitHub Pages. | A navegação autenticada continua bloqueada sem sessão de teste. |

### Em andamento

- PR #144 adiciona um visualizador vertical para vídeos reais que já estão no feed, com navegação por gesto/botões, curtida, painel de comentários, compartilhamento interno/externo e retorno ao feed.
- Build, parse de módulos, testes npm e workflow de segurança passaram nessa PR. A validação especializada do FaceLandmarker falhou ao aguardar resposta completa do bundle/modelo externo; uma nova execução foi solicitada.
- A PR não adiciona controle de salvar: o esquema e endpoint autorizados para salvamento ainda precisam ser desenhados e validados.

### Ainda falta executar do prompt

1. Stories: política de republicação configurável pelo autor, fluxo para adicionar ao próprio Story, preservação da autoria original e bloqueio de Stories privados; teste real do áudio depois de publicação e teste autenticado em contas separadas.
2. Feed/Reels: salvar com persistência e autorização, verificar contagens em banco e testar navegação/mídia em navegador autenticado e celular.
3. Administração: endpoint seguro para moderação e operações administrativas; testar requisições diretas como usuário comum e administrador.
4. Cartas: corrigir o carregamento inicial que ainda falha; editor responsivo completo, títulos, dicas e alteração segura de senha privada; testar conta Peixinho e destinatário sem recarregar a página.
5. Músicas: pesquisa como seletor para dedicatórias, visualizações recebidas/enviadas, playlists administrativas, comentários por faixa e validação real de reprodução por provedor.
6. Galeria: concluir e validar upload, filtros, edição, favoritos, exclusão autorizada e visualização em larguras pequenas.
7. Chat: validar fotos de perfil; adicionar foto de grupo com autorização; catálogo legal de figurinhas, favoritos, recentes, pesquisa e envio persistido.
8. Chamadas: portar sinalização/realtime que hoje está explicitamente indisponível no adaptador, testar WebRTC entre usuários/redes e confirmar liberação de câmera e microfone.
9. Qualidade geral: teste visual autenticado nas larguras de 320–390 px, Safari iOS, Chrome Android e desktop; não há evidência de acesso a dispositivos físicos nesta sessão.

### Operações de dados posteriores à auditoria inicial

Depois do registro somente-leitura acima, a PR #143 aplicou apenas DDL aditiva e concessões/policies restritivas para menções e notificações no Neon principal. Não foram apagadas nem reinicializadas tabelas, Stories, mídias ou notificações existentes. A validação de permissões foi repetida no branch principal.