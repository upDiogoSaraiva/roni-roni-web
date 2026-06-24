# ROADMAP — plataforma de pools

Visão: deixar de ser uma app de uma edição e passar a ser uma plataforma de muitos anos, com
utilizadores, histórico por pessoa e por competição, e um construtor de competições com regras
flexíveis. Trabalho no ramo `platform`; o `main` mantém a app ao vivo do Mundial 2026.

## Alvo acordado (2026-06-24)
Estrela polar: **jogar ano após ano** — carreiras (palmarés, recordes, rivalidades), drama ao vivo
e reveal com história, recaps automáticos e um construtor onde o grupo inventa o seu jogo. Tudo
neutro, determinístico e partilhável no WhatsApp. Decisões: alcance = pool do grupo multi-edição
(não multi-grupo, não genérico); identidade = token mágico sem password; primeiro = camada social.

Plano por fases:
- **Fase A — drama da edição atual** (sem contas): evolução por jornada, simulador "e se?", reveal
  das apostas, recaps por jornada, H2H da época, cartões SVG para WhatsApp.
- **Fase B — identidade** (token mágico, persistente entre dispositivos/edições).
- **Fase C — carreiras & Hall da Fama** (agregação entre edições, all-time, rivalidades).
- **Fase D — o jogo é teu** (boosts, aposta por jogo + underdog, UI dos mercados, construtor).

## Já feito (base)
- Pool do Mundial 2026: apostar (campeão, Final 4, grupos, 8 melhores 3.os), classificação ao vivo,
  resultados, mata-mata (vencedor/fase/jokers), prémios, admin.
- Pontuação de raiz com desempate por confronto direto (2026), badges de garantido/eliminado.
- Resultados reais ao vivo da ESPN; competição já vem de `data/competition.json`.

## Fase 2 — multi-competição + histórico + pessoal
- [x] Estrutura `data/competitions/<id>/` + `data/registry.json` (ativa + arquivadas).
- [x] Servidor carrega a competição ativa; admin troca a ativa.
- [x] Página **Histórico**: lista de edições; ver uma edição passada (classificação final, vencedores, prémios).
- [x] Página **Pessoal** ("A minha época"): a folha e os pontos de um jogador, e o seu historial entre edições.

## Fase 3 — construtor de competições + import
- [x] **Import** de edições passadas (classificação final) para o histórico (admin → Competições).
- [x] Admin troca a competição ativa.
- [ ] Admin **cria competição** ao vivo: nome, grupos, equipas, formato, regras (UI do construtor).

## Mercados de aposta (configuráveis por competição)
- [x] Posições de grupo (1.º/2.º) + N melhores 3.os (base atual).
- [x] Outright: campeão, Final 4.
- [x] Mata-mata por ronda: vencedor + fase (TR/Prol/Pen) + jokers.
- [x] **Mercados extra** (motor + API + testes): melhor marcador, melhor jogador, melhor jovem,
      "melhor pior equipa" e quaisquer outros — definidos na config, resolvidos pelo admin.
      Falta a UI de aposta (passo "Extras") e de resolução no admin.
- [ ] Resultado de cada jogo de grupo, com **bónus de underdog**.

## Boosts (configuráveis, estilo joker)
- [ ] Joker: duplica os pontos de um jogo (já existe no mata-mata; trazer também aos grupos).
- [ ] Escudo: anula a perda de pontos num jogo.
- [ ] Triplo / Banker: aposta de confiança que vale a triplar.
- [ ] Limites configuráveis por fase (quantos boosts, em que rondas).

## Sistemas de pontuação (presets)
- [ ] Preset "Mundial 2026" (atual).
- [ ] Preset "clássico Roni" (apostar em todos os jogos de grupo + underdog + jokers de grupo).
- [ ] Pontos totalmente editáveis no construtor.

## Utilizadores
- [ ] Contas (nome + PIN hoje; evoluir para login simples por dispositivo/token).
- [ ] Página pessoal liga as apostas da pessoa em todas as edições.

## Ideias minhas (extra)
- [x] Gráfico da posição ao longo das jornadas (página **Evolução**, replay por jornada).
- [ ] Comparar dois jogadores lado a lado (head-to-head).
- [x] Simulador "e se?" — página **E se?**, projeta a classificação dos jogos que faltam.
- [ ] Cartão de jogador partilhável (imagem) para o WhatsApp.
- [ ] Estatísticas: mais "chalk" vs mais contrário ao campo; média de pontos; melhor aposta.
- [ ] Contagem decrescente para o próximo prazo de apostas.
- [ ] Transparência do desempate ("porque está esta equipa à frente").
- [ ] Multi-idioma (PT/EN) para abrir a mais gente.
