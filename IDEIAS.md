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
- [✅] **Streak de pódio** — jornadas seguidas no top 3 (na Conquistas, do `/api/timeline`).
- [✅] **Nível/XP do jogador** — título por pontos + barra de progresso (Conquistas).
- [✅] **Campeão da jornada** — quem mais pontos ganhou na última jornada (destaques da Evolução).

### Social / competição
- [✅] **Nemesis / próximo alvo** — o cartão hero mostra quem apanhar a seguir (jogador logo à frente).
- [✅] **Rivalidades** — pares que mais trocaram de posição entre si ao longo das jornadas (na Evolução).
- [💡] **Liga de quartos** — sub-grupos (ex.: por apelido/escolha) com mini-tabela.
- [💡] **Mural de reações** — emojis por jogador (sem texto livre? rever neutralidade/segurança).
- [✅] **Partilhar a tabela** como imagem (cartão de leaderboard top 10 para o WhatsApp).

### Dados / visualização
- [✅] **Mais escolhidas para apurar** (Reveal) — seleções mais escolhidas como 1.º/2.º em todos os grupos. [💡] falta versão por-grupo (heatmap).
- [✅] **Distribuição de pontos** (Reveal) — histograma dos pontos do grupo por intervalos de 5.
- [✅] **"De onde vêm os meus pontos"** — barra empilhada (apuramento/posição/campeão/Final 4/mata-mata/extras) na folha que abre no leaderboard.
- [✅] **Recorde "maior salto"** no Hall da Fama (maior ganho de pontos numa jornada). [💡] falta linha do tempo completa.
- [💡] **Comparador de N jogadores** (estender o H2H a 3-4 colunas).

### Qualidade de vida / mobile
- [✅] **Contagem decrescente** para o fim da fase de grupos (na Geral, a partir das datas da competição).
- [💡] **Pesquisa global** (jogadores + seleções) no topo.
- [✅] **Cartão pessoal "hero"** — topo da Geral mostra a minha posição/pontos/movimento e distância ao 1.º.
- [✅] **Copiar o meu resumo** — botão no hero que copia um texto curto da minha situação para o WhatsApp.
- [✅] **Partilha por link** de uma folha de jogador (rota `#/folha/<nome>` + copiar link).

### Polish visual / microinterações
- [✅] **Sparkline do percurso** no cartão pessoal hero (posição por jornada em miniatura).
- [✅] **Contagem animada** dos pontos (count-up) ao abrir a tabela (respeita prefers-reduced-motion).
- [✅] **Realce do líder** — coroa 👑 + fundo dourado subtil na linha do 1.º.
- [✅] **Magnitude do movimento** — a seta de subiu/desceu passa a mostrar quantas posições.
- [💡] **Animação de entrada** das linhas da tabela (já há fade; afinar).
- [✅] **Transições de página** suaves (fade+slide ao mudar de vista; respeita reduced-motion).

### Acessibilidade
- [✅] Respeito por `prefers-reduced-motion` (global) + `aria-label` na nav de chips.
- [✅] **Modo alto contraste** — toggle no header (reforça texto/contornos sobre qualquer tema).
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
- **Folha partilhável por link** (Ronda 14, ângulo QoL/distribuição) — rota `#/folha/<nome>` com a
  folha e pontos do jogador + copiar link. Fonte: deep-links de partilha. Porquê: mandar a alguém a
  sua folha direto no chat. Neutro.
- **Streak de pódio** (Ronda 15, ângulo gamificação) — jornadas seguidas no top 3, na Conquistas
  (do `/api/timeline`). Fonte: streaks de fantasy apps. Porquê: recompensa a consistência. Neutro.
- **Comparação vs média** (Ronda 16, ângulo dados/QoL) — o cartão hero mostra os pontos do jogador
  face à média do grupo. Fonte: benchmarking de dashboards. Porquê: contextualiza a prestação. Neutro.
- **Vencedor por métrica no H2H** (Ronda 17, ângulo dados) — no Frente a frente, a métrica melhor de
  cada linha (posição/pontos/apuramento/posições) fica realçada. Fonte: comparadores lado-a-lado.
  Porquê: lê-se num instante quem ganha cada categoria. Neutro.
- **Contagem decrescente** (Ronda 18, ângulo QoL) — aviso na Geral com os dias que faltam para o fim
  da fase de grupos (datas da competição expostas em `/api/state`). Fonte: countdowns de eventos.
  Porquê: cria urgência/antecipação. Neutro (apenas uma data).
- **Modo alto contraste** (Ronda 19, ângulo acessibilidade) — toggle no header que reforça texto e
  contornos sobre qualquer tema (`data-hc`), persistido. Fonte: boas práticas WCAG. Porquê: legível
  para quem precisa de mais contraste. Neutro.
- **Recorde "maior salto"** (Ronda 20, ângulo dados/recordes) — no Hall da Fama, o maior ganho de
  pontos numa única jornada (do `/api/timeline`). Fonte: linhas de recordes desportivos. Porquê:
  memória e picardia. Neutro.
- **Transição de página** (Ronda 21, ângulo polish) — fade+slide subtil ao mudar de vista (`.pg-in`),
  re-disparada em cada `render()`; respeita reduced-motion. Fonte: microinterações modernas. Porquê:
  sensação de fluidez. Neutro.
- **Nemesis / próximo alvo** (Ronda 22, ângulo social) — inspiração: features "nemesis" de apps de
  fitness/competição (fonte: artigos de retenção de leaderboards 2026). O hero mostra quem apanhar a
  seguir (jogador logo à frente) + a distância. Porquê: alvo concreto motiva mais que o 1.º distante.
- **Campeão da jornada** (Ronda 23, ângulo social/dados) — quem mais pontos ganhou na última jornada,
  nos destaques da Evolução. Inspiração: "janela que renova" (semanal) das apps de competição.
  Porquê: dá uma vitória de curto prazo a quem não lidera. Neutro.
- **Magnitude do movimento** (Ronda 24, ângulo polish/dados) — a seta de movimento na tabela mostra
  quantas posições subiu/desceu. Fonte: leaderboards com delta explícito. Porquê: informação útil
  sem custo. Neutro.
- **Copiar o meu resumo** (Ronda 25, ângulo distribuição) — botão no hero que copia um texto curto
  ("Estou em X.º de Y com Z pontos") para colar no WhatsApp. Fonte: partilha por texto. Porquê:
  partilha sem fricção, complementa o cartão-imagem. Neutro.
- **Distribuição de pontos** (Ronda 26, ângulo visualização) — histograma dos pontos do grupo por
  intervalos de 5, no Reveal. Fonte: histogramas de dashboards. Porquê: mostra se a pool está
  renhida ou esticada. Neutro.

## Ronda "uau" (efeito genuíno, pesquisa de microinterações 2026) — ✅ todas implementadas+testadas

Fonte desta ronda: pesquisa sobre delight/microinterações 2026 (confetti tipo Duolingo, "unicórnio"
do Asana, heart-bloom do Instagram), técnica **FLIP** para reordenação a 60fps, e UX dos **stories**
do Instagram (barras segmentadas, auto-avanço, tap para saltar, hold para pausar). Princípio que a
pesquisa reforça: surpresa+encanto eleva muito a perceção, mas **não exagerar** — usar com parcimónia.

- ✅ **Roni Wrapped como story imersivo** (ângulo viralidade/encanto) — o Wrapped deixa de ser cartão
  com setas e passa a player ecrã-inteiro: barras de progresso segmentadas no topo, auto-avanço,
  tap à direita/esquerda para saltar, manter premido para pausar, e remate com CTA de partilha.
  Fonte: UX dos stories do Instagram. Porquê: o formato mais partilhado de 2026, sensação premium.
- ✅ **Confetti de celebração** (ângulo encanto) — quando lidero ou subo posições, um confetti discreto
  em canvas (ouro/ember/creme), uma vez por sessão, a respeitar `prefers-reduced-motion`. Fonte:
  momentos de celebração (Duolingo, Asana). Porquê: recompensa o progresso sem ser repetitivo.
- ✅ **Reordenação animada (FLIP)** (ângulo polish/motion) — ao mudar a ordenação da classificação, as
  linhas deslizam para a nova posição (medir→mutar→inverter→tocar, só `transform`, 60fps). Fonte:
  técnica FLIP. Porquê: a tabela ganha vida, percebe-se quem trocou de lugar.
- ✅ **Remate + vibração no Wrapped** (ângulo encanto) — confetti por cima do último slide do story e
  uma vibração curta no telemóvel (quando suportada). Fonte: haptics + finais celebrativos. Porquê:
  fecha a experiência com um momento de recompensa.
- ✅ **Roni Wrapped mais profundo** (ângulo narrativa/recap) — de 4 para ~12 slides pessoais e
  condicionais com linha de contexto: melhor posição, pontos com detalhe, apuramentos certos,
  posições exatas, mais pontos numa jornada (com a jornada), subida desde o arranque, **golpe de
  génio** (acerto de posição que menos gente partilhou), o teu campeão (e quantos o escolheram),
  **desastre da época** (o favorito que apostaste e ficou de fora), **chip especial** (joker de grupo
  a dobrar ou desperdiçado) e conquistas. Fonte: Spotify/sports Wrapped + pedido do utilizador.
  Porquê: transforma estatística em história com drama; cada jogador vê um recap diferente. Neutro.
- ✅ **Mais drama no Wrapped** (ângulo narrativa, pedido do utilizador) — **a maior queda** (pior descida
  de lugares numa jornada, o oposto do maior salto), **rival da época** (o jogador com quem mais trocaste
  de lugar ao longo das jornadas — lead changes do `/api/timeline`) e **faltou para o pódio** (pontos
  até ao 3.º lugar, só se fora do top 3). Porquê: o contraste entre o teu resultado e os outros é o que
  cria história (herói/vítima/quase). Neutro.
- ✅ **Seleção da sorte + capa de fecho** (ângulo recap/partilha) — a seleção que mais pontos te deu
  (apuramento+posição, a dobrar no grupo do joker) e uma capa final "A minha época" (posição + pontos
  entre N jogadores) onde o confetti remata. Porquê: nota pessoal sobre uma seleção + um frame de fecho
  feito para partilhar. Neutro.
- ✅ **Bandeiras nos slides de seleção** (ângulo visual/temático) — campeão, seleção da sorte, golpe de
  génio e desastre passam a mostrar a bandeira da seleção (reutiliza `getFlagEl`/`placeFlag` inline, sem
  tainting; na pré-visualização, no story player e no PNG). Porquê: salto visual e identidade WC2026. Neutro.
- ✅ **Cor + count-up no Wrapped** (ângulo polish/encanto) — valor a ouro nos momentos bons e a ember nos
  maus (leitura emocional imediata); número conta para cima na revelação de cada slide (só no player,
  respeita reduced-motion). Fonte: Spotify Wrapped + microinterações. Porquê: ritmo visual e revelação. Neutro.
- ✅ **Capa de abertura pessoal** (ângulo identidade) — o primeiro slide do story ganha o monograma do
  jogador (cores próprias, reutiliza `monogram()`) por cima da marca. Porquê: abertura pessoal e coesa
  com o resto da app. Neutro.
