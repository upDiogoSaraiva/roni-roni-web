# DESIGN_WEB.md — app do pool *Roni Roni* (mobile-first, sem sinais de AI)

Decisões de design da **app de consumo** do pool. Herda do `DESIGN.md` do motor a *régua de
qualidade* e a lista de anti-padrões a evitar, mas **adapta a linguagem**: aqui o produto é uma
app de grupo que se abre no telemóvel a partir do WhatsApp — clara, rápida e com carácter, ao
nível de um Sofascore/OneFootball — **não** um dashboard denso de analista.

> Conteúdo estritamente neutro: **apostas, resultados e pontos**. Nunca probabilidades,
> recomendações ou qualquer output do motor de decisão.

## (a) Anti-padrões a evitar ("AI slop") — herdado, com a fonte do motor
- **Fonte default (Inter/Roboto) sem hierarquia** — o sinal #1 de UI não-intencional.
- **Gradiente roxo→azul** em heros/CTAs/fundos — o "safe" mais amostrado pelos modelos.
- **"Card soup"**: layout centrado com 3 cartões simétricos iguais e arredondados, muito vazio.
- **Microcopy genérico** ("Welcome", "Powered by AI", títulos que não dizem nada).
- **Motion decorativo**: o mesmo fade-in em tudo, sem intenção.
- **Glassmorphism gratuito, paleta Tailwind default, emojis como ícones/títulos.**
- (Fontes originais no `DESIGN.md` do motor: saascity.io, 925studios.co, monet.design, uxpin.com.)

## (b) Princípios — adaptados a produto de consumo mobile-first
- **Mobile-first a sério**: um grupo de cada vez, navegação por passos, alvos de toque ≥ 44px,
  sem necessidade de zoom, tipografia legível ao sol. O desktop é o telemóvel respirado, não o
  contrário.
- **Clareza desportiva**: bandeira + nome + número. O número é sagrado — numerais tabulares
  alinhados à direita. A leitura do leaderboard faz-se num relance.
- **A cor é funcional**: estado (apurado / fora / pendente) nunca depende só da cor — sempre
  emparelhado com texto/ícone/forma.
- **Personalidade, não decoração**: uma cor de marca forte e escassa; o ouro só para o líder e
  para o campeão. Motion subtil e com função (revelar ordem, confirmar ação), nunca por enfeite.
- **Todos os estados tratados**: a carregar (skeleton), vazio, erro (com a mensagem do servidor)
  e sucesso de submissão com bom feedback.
- **Acessibilidade**: contraste AA, `:focus-visible`, navegação por teclado nos selects e passos,
  `aria-live` para validação e para o estado de submissão. **Sem `innerHTML` cru** — tudo via
  `textContent`/nós, para conteúdo do utilizador e dados.

## (c) Identidade visual própria
Marca **Roni Roni** — energia de grupo, mas fiável (substitui um Excel partilhado).

- **Tipografia (com carácter, não-Inter)**:
  - Display/títulos: **Space Grotesk** (700/600) — grotesca geométrica, sporty.
  - UI/corpo: **Hanken Grotesk** — humanista, quente, muito legível em ecrã pequeno.
  - Números: **DM Mono** com `font-variant-numeric: tabular-nums` em TODOS os números
    (pontos, golos, posições). Hierarquia por peso/tamanho, não por cor.
- **Paleta** (sem roxo, sem gradiente genérico). Cor de marca = **vermelhão "ember"**; ouro
  escasso para o topo; neutros **quentes** (não cinza frio); verde/clay funcionais para estado:

  | papel | claro | escuro |
  |---|---|---|
  | marca (ember) | `#E5482A` | `#FF6A4D` |
  | ouro (líder/campeão) | `#C98A1B` | `#F2B441` |
  | fundo (papel quente) | `#F6F1E8` | `#14110D` |
  | superfície (cartão) | `#FFFFFF` | `#1E1A14` |
  | superfície 2 | `#FBF7F0` | `#272118` |
  | hairline | `#E7DECF` | `#332B20` |
  | texto | `#1B1712` | `#F3ECE0` |
  | texto suave | `#6B6256` | `#A89C88` |
  | apurado (verde) | `#1B8E5A` | `#43C98A` |
  | fora/eliminado (clay) | `#9A4B2E` | `#D98A5A` |
  | pendente (slate quente) | `#8A8170` | `#7C7263` |

- **Forma e ritmo**: raio base 14px (cartões), 10px (controlos), 999px (chips/avatars). Escala de
  espaçamento 4·8·12·16·20·24·32·48. Sombras baixas e quentes, nunca "flutuante AI".
- **Componentes**: cartão de jogador com **monograma** (iniciais, cor derivada do nome); chips de
  estado (Submetido / Falta, Janela aberta/fechada); **combobox pesquisável** acessível; barra de
  **progresso por passos** no formulário; leaderboard tabular com **medalha** no top-3 e seta de
  **movimento**; linha expansível com a folha pública.
- **Microcopy** específico e em PT: "Faz a tua aposta", "8 melhores 3.os", "Apurado", "Janela
  fechada", "Pódio". Nada de "Welcome"/"Powered by".
- **Ícones**: SVG inline (setas, medalha, check, lupa) e um ponto "ao vivo" pulsante; **sem
  emojis como ícones** (as bandeiras são conteúdo de dados, não decoração).
- **Motion**: uma entrada escalonada ao carregar listas (revela a ordem de leitura); transição de
  passo no formulário; *count* suave dos pontos quando o leaderboard recalcula. Respeita
  `prefers-reduced-motion`.

## (d) As quatro áreas
- **Apostar** (a mais importante): identificação → passos (Campeão · Final 4 · 12 grupos · 8
  terceiros) com barra de progresso, selects pesquisáveis filtrados ao grupo certo, validação
  inline, ecrã de revisão e estado de sucesso.
- **Geral** (leaderboard): posição, jogador, pontos ao vivo, ordenável, movimento, destaque do
  topo, expandir para a folha pública, pesquisa.
- **Resultados**: jogos por jornada com o resultado real e os pontos que cada jogo distribuiu;
  classificação por grupo e os 8 melhores 3.os.
- **Admin**: grelha das apostas (pesquisa/filtro), estado das submissões, edição de resultados que
  recalcula tudo, abrir/fechar janela — atrás de uma password simples.
