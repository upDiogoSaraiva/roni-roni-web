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
- [💡] **Nível/XP do jogador** — derivado dos pontos; barra de progresso e título ("Veterano").
- [💡] **Selo de "melhor jornada"** — quem mais subiu em cada jornada ganha um selo nessa jornada.

### Social / competição
- [💡] **Rivalidades** — par de jogadores com mais trocas de posição entre si ao longo das jornadas.
- [💡] **Liga de quartos** — sub-grupos (ex.: por apelido/escolha) com mini-tabela.
- [💡] **Mural de reações** — emojis por jogador (sem texto livre? rever neutralidade/segurança).
- [💡] **Partilhar a tabela** como imagem (cartão de leaderboard para o WhatsApp).

### Dados / visualização
- [💡] **Mapa de calor de apuramento** — por grupo, quantas vezes cada equipa foi escolhida 1.º/2.º/3.º.
- [💡] **Gráfico "de onde vêm os meus pontos"** — donut apuramento/posição/extras/mata-mata.
- [💡] **Linha do tempo de recordes** — maior subida/queda de sempre, melhor jornada do grupo.
- [💡] **Comparador de N jogadores** (estender o H2H a 3-4 colunas).

### Qualidade de vida / mobile
- [💡] **Contagem decrescente** para o próximo prazo de apostas / próxima jornada.
- [💡] **Pesquisa global** (jogadores + seleções) no topo.
- [💡] **"A minha equipa do dia"** — atalho para a minha folha e posição num cartão compacto.
- [💡] **Partilha por link** de uma folha de jogador.

### Polish visual / microinterações
- [💡] **Contagem animada** dos pontos (count-up) ao abrir a tabela.
- [💡] **Confete/realce** discreto no líder.
- [💡] **Animação de entrada** das linhas da tabela (já há fade; afinar).
- [💡] **Transições de página** suaves.

### Acessibilidade
- [💡] **Modo alto contraste** e respeito por `prefers-reduced-motion`.
- [💡] **Navegação por teclado** completa nos chips e listas.

## Implementadas (rasto)
- **Conquistas / Badges** (Ronda 1, ângulo gamificação) — ver commit. Fonte: fantasy apps (badges/achievements).
  Porquê: dá estatuto e colecionismo, dois motores de regresso diário, e é 100% derivável dos dados neutros.
