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
