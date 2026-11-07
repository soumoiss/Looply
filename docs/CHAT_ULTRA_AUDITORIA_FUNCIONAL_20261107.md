# Auditoria Chat Ultra 3.0 — mapeamento de 95 seções
Data: 07/11/2026
Fonte primária: `docs/CHAT_ULTRA_MAPEAMENTO_20261107.md`.
Aplicação: `soumoiss/Looply` — GitHub Pages, Neon PostgreSQL/Auth, Cloudflare Workers/R2, Android WebView.

## Critérios rigorosos de classificação
- **Integrado em código:** UI chama RPC/serviço real com sessão; não equivale a aceite de teste em smartphone.
- **Persistência remota:** dados e permissões de servidor, não simples `localStorage`.
- **Parcial:** há interface/parte do servidor, mas falta regra, sincronização ou aceite E2E.
- **Não concluído:** contrato funcional das seções 87–93 exige trabalho adicional.

## Cobertura por grupos da especificação

| Referência no mapa | Funcionalidade | Situação após PR #268 | Prova/limitação |
| --- | --- | --- | --- |
| 1–13, 57–60, 67–69 | Inbox, personalização, configurações de conversa | Parcial | Preferências visuais por conta no dispositivo; apelido salvo no banco, mas fixação/silenciamento/arquivamento ainda predominantemente locais |
| 14–30, 85, 88 | Mensagens, resposta, edição, reação, apagar, leitura | Parcial | `chat_messages`, `chat_message_reactions`, `mark_conversation_read` reais; renderização limitada às 100 últimas e sem garantias completas de reenvio idempotente em todos os tipos |
| 31–39, 88 | Texto, foto, vídeo, arquivos, voz, contato, localização e notas | Integrado em código | `chat_media` + R2 com links HTTPS assinados; players mobile adicionados, sem ensaio físico de todas as extensões |
| 40–45 | Figurinhas e favoritos | Integrado em código | 535 registros Neon/R2 e pacote `Stickers/` copiado no build; importação/favoritos por conta, ainda verificar todos os objetos em dois dispositivos |
| 46–50 | Cartas, enquetes, notas, músicas e compartilhamento | Parcial | Cartas e enquetes são mensagens estruturadas; enquetes até oito opções com RPC v38 autenticada; diversas formas avançadas do editor ainda pendentes |
| 51–56, 77, 90 | Atividades, notificações, simulação e push | Parcial | Entradas fictícias escondidas/desabilitadas; notificações FCM/Neon já existem; entrega, deduplicação e deep-link fora do app dependem de aceite entre aparelhos |
| 57–65, 71–73 | Grupos, foto, membros, moderação, nomes, saídas | Parcial | Operações de membro usam RPC `v36_...`; denúncias reais em `chat_conversation_reports`, nome via atualização autorizada; regras completas de papéis, convite, remoção, sair e excluir ainda requerem auditoria E2E |
| 61–62, 83 | Papel de parede e foto do grupo | Parcial | Fundo é individual por conversa no navegador, não sincroniza entre celulares; foto de grupo usa fluxo remoto de capa, sem validação de todos os WebViews |
| 66, 70 | Silenciar, bloqueio | Não concluído | Flags locais não substituem bloqueio de comunicação/FCM nem preferências remotas autorizadas |
| 74–76 | Mídias, mensagens salvas, exportação | Parcial | Ferramentas presentes, mas exportação não empacota mídia e não há busca paginada total |
| 78–81 | Modais, gestos, rolagem, teclado, animações | Parcial | Interface preservada; integração das folhas reais, mas precisa teste físico com teclado Samsung/Gboard e com latência |
| 82, 84 | Estados de erro, rascunhos | Parcial | Nova correção preserva texto quando falha envio; rascunho e demais tipos incompletos em outros aparelhos |
| 86–89 | WebRTC, partidas remotas e eventos de ligação | Integrado em código; **não validado em dois smartphones** | Chat Ultra agora abre `src/chat-calls.js`, `src/chat-ttt.js`, `src/chat-gartic.js`; indisponibilidade de TURN em determinadas redes ainda possível |
| 87, 91–93 | Agendamento, infraestrutura, aceite e segurança | Parcial | Fila Neon v39, identidade validada, processamento idempotente na rotina cron existente; exige publicação bem-sucedida do Worker e teste de entrega com aparelho fechado |
| 94–95 | Glossário, visão executiva | Referência | Contrato de implementação, não funcionalidade isolada |

## Pendências prioritárias após esta revisão
1. **P0:** implementar bloqueio autorizado no servidor, revogação de ligações/convites, políticas push por conversa e listas pessoais de bloqueados.
2. **P0:** validar ligação real em dois Androids (oferta/aceite/recusa, áudio bidirecional, câmera, TURN em rede móvel), além de convites de Gartic e Jogo da Velha em duas contas.
3. **P0:** confirmar implantação e Cron Trigger do Worker de mensagens programadas; confirmar entrega com navegador e APK fechados, sem duplicidade.
4. **P0:** acesso controlado e sincronizado para saída/remoção de grupos; revisar RLS e foto de grupo com criador versus membro.
5. **P1:** separar opções pessoais sincronizadas de estado apenas local: papel de parede, favoritos, silenciamento, arquivamento, cores, fixados.
6. **P1:** histórico paginado, busca de mensagens anteriores, reconciliação offline/retry por ID, notificações de digitação, mídia com cache revogável, waveform originado no áudio (não pseudo-visual).
7. **P1:** salvar/exportar mídias autorizadas, fixar mensagens, rascunhos em tipos complexos, temporárias e outras interações das 95 seções.
8. **P2:** testes A11y, controle de movimentação, layout em múltiplos tamanhos de tela, editor premium e efeitos.

**Regra de encerramento:** não marcar toda a especificação como 100% sem testes automatizados e testes com duas contas reais em smartphones. Não apagar dados legados; preservar usuário administrador Peixinho e a regra de manutenção existente.