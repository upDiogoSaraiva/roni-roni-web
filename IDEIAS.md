# IDEIAS — branch `ideias` (NÃO fazer merge para `platform`)

Registo vivo do ciclo de ideias. Cada ideia: **fonte/inspiração**, **porquê**, **estado**
(💡 por fazer · 🔨 a fazer · ✅ implementada+testada · ❌ descartada). Tudo **neutro**: só apostas,
resultados e pontos — nada de probabilidades, recomendações ou dados do motor de decisão.

Princípios herdados: zero dependências, determinístico, `.bak` antes de gravar, mobile-first,
acessível (sem innerHTML cru), tema claro/escuro. Servidor de dev na porta 4100.

## Fontes de inspiração
- Social sportsbooks / pools (TheLines, GoalPoolPro, Easypromos) — leaderboards diário/semanal/all-time,
  ligas privadas, head-to-head, partilha de palpites, reações.
- Fantasy apps UX (SportsFirst, JPLoft, Medium) — badges/conquistas, streaks, XP/tiers, microinterações
  (animações ao pontuar), dashboards personalizados, comunidade.
- Princípio transversal: previsão cria antecipação e regresso; competição saudável entre amigos
  vive de memória, picardia e estatuto.

## Backlog priorizado (por ronda/ângulo)

### Gamificação
- [✅] **Conquistas / Badges** — distintivos determinísticos por jogador (trio perfeito, faro de
  apuramento, contra a corrente, em ascensão, pódio…). *Porquê:* estatuto e colecionismo fazem voltar.
- [💡] **Streak de pódio** — quantas jornadas seguidas no top 3 (do `/api/timeline`).
- [✅] **Nível/XP do jogador** — título por pontos + barra de progresso (Conquistas).
- [💡] **Selo de "melhor jornada"** — quem mais subiu em cada jornada ganha um selo nessa jornada.

### Social / competição
- [✅] **Rivalidades** — pares que mais trocaram de posição entre si ao longo das jornadas (na Evolução).
- [💡] **Liga de quartos** — sub-grupos (ex.: por apelido/escolha) com mini-tabela.
- [💡] **Mural de reações** — emojis por jogador (sem texto livre? rever neutralidade/segurança).
- [✅] **Partilhar a tabela** como imagem (cartão de leaderboard top 10 para o WhatsApp).

### Dados / visualização
- [✅] **Mais escolhidas para apurar** (Reveal) — seleções mais escolhidas como 1.º/2.º em todos os grupos. [💡] falta versão por-grupo (heatmap).
- [✅] **"De onde vêm os meus pontos"** — barra empilhada (apuramento/posição/campeão/Final 4/mata-mata/extras) na folha que abre no leaderboard.
- [💡] **Linha do tempo de recordes** — maior subida/queda de sempre, melhor jornada do grupo.
- [💡] **Comparador de N jogadores** (estender o H2H a 3-4 colunas).

### Qualidade de vida / mobile
- [💡] **Contagem decrescente** para o próximo prazo de apostas / próxima jornada.
- [💡] **Pesquisa global** (jogadores + seleções) no topo.
- [✅] **Cartão pessoal "hero"** — topo da Geral mostra a minha posição/pontos/movimento e distância ao 1.º.
- [💡] **Partilha por link** de uma folha de jogador.

### Polish visual / microinterações
- [✅] **Sparkline do percurso** no cartão pessoal hero (posição por jornada em miniatura).
- [✅] **Contagem animada** dos pontos (count-up) ao abrir a tabela (respeita prefers-reduced-motion).
- [✅] **Realce do líder** — coroa 👑 + fundo dourado subtil na linha do 1.º.
- [💡] **Animação de entrada** das linhas da tabela (já há fade; afinar).
- [💡] **Transições de página** suaves.

### Acessibilidade
- [✅] Respeito por `prefers-reduced-motion` (global) + `aria-label` na nav de chips. [💡] falta modo alto contraste.
- [✅] **Navegação por teclado** nos chips (setas ←/→ movem o foco entre vistas).

## Implementadas (rasto)
- **Conquistas / Badges** (Ronda 1, ângulo gamificação) — ver commit. Fonte: fantasy apps (badges/achievements).
  Porquê: dá estatuto e colecionismo, dois motores de regresso diário, e é 100% derivável dos dados neutros.
- **Composição dos pontos** (Ronda 2, ângulo visualização de dados) — barra empilhada na folha do
  jogador. Fonte: dashboards de fantasy ("de onde vêm os pontos"). Porquê: torna o score legível de
  relance e dá identidade ("eu vivo da posição", "eu vivo do apuramento"). Neutro.
- **Count-up dos pontos** (Ronda 3, ângulo polish/microinterações) — os pontos da tabela contam de 0
  até ao valor ao abrir. Fonte: microinterações de fantasy apps. Porquê: dá vida e reforça o número
  que importa; respeita `prefers-reduced-motion`.
- **Rivalidades** (Ronda 4, ângulo social/picardia) — na Evolução, os pares que mais trocaram de
  posição (desempate: mais próximos agora). Fonte: head-to-head records de social sportsbooks.
  Porquê: alimenta a picardia do grupo; derivado das posições por jornada (`/api/timeline`), neutro.
- **Partilhar a tabela** (Ronda 5, ângulo distribuição) — botão "Partilhar" na Geral gera um cartão
  PNG (top 10) via SVG→canvas e usa a partilha nativa (ou descarrega). Fonte: cultura de partilha no
  WhatsApp dos grupos. Porquê: traz gente de volta à app a partir do chat; reusa o pipeline do cartão.
- **Cartão pessoal "hero"** (Ronda 6, ângulo QoL/mobile) — no topo da Geral, quando há jogador
  identificado/escolhido, mostra a sua posição, pontos, movimento e distância ao 1.º. Fonte: dashboards
  personalizados de fantasy. Porquê: respondes logo a "como vou eu?" sem procurar na tabela. Neutro.
- **Movimento reduzido + semântica** (Ronda 7, ângulo acessibilidade) — `@media (prefers-reduced-motion)`
  global desliga animações/transições; `aria-label` na nav de chips. Fonte: boas práticas de UX/a11y.
  Porquê: inclusivo e respeita preferências do sistema, sem custo para os restantes.
- **Estatísticas da época** (Ronda 8, ângulo dados) — no Reveal: média de pontos do grupo e extremos
  (mais/menos pontos). Fonte: dashboards desportivos. Porquê: contextualiza a tabela ("estou acima
  ou abaixo da média?"). Derivado do leaderboard, neutro.
- **Sparkline do percurso** (Ronda 9, ângulo microviz/dados) — mini-gráfico da posição por jornada no
  cartão pessoal hero, do `/api/timeline`. Fonte: sparklines de dashboards. Porquê: o teu percurso de
  relance sem abrir a página de Evolução. Neutro.
- **Realce do líder** (Ronda 10, ângulo polish/celebração) — coroa 👑 e fundo dourado subtil na linha
  do 1.º. Fonte: celebração de líderes em leaderboards. Porquê: dá foco e estatuto ao topo. Neutro.
- **Nível/XP** (Ronda 11, ângulo gamificação) — título por pontos (Estreante→Lenda) + barra de
  progresso para o nível seguinte, na Conquistas. Fonte: tiers/XP de fantasy apps. Porquê: progressão
  dá sensação de evolução. Neutro.
- **Mais escolhidas para apurar** (Ronda 12, ângulo dados) — no Reveal, seleções mais escolhidas como
  1.º/2.º em todos os grupos. Fonte: heatmaps de consenso. Porquê: mostra o "chalk" coletivo do
  apuramento de relance. Neutro.
- **Navegação por teclado nos chips** (Ronda 13, ângulo acessibilidade) — setas ←/→ movem o foco entre
  as vistas. Fonte: padrões ARIA de navegação. Porquê: usável sem rato. Neutro.
