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
- **Fase A — drama da edição atual** ✅ CONCLUÍDA (sem contas): evolução por jornada (+ hover),
  simulador "e se?", reveal das apostas, recaps por jornada, frente a frente, cartões para WhatsApp.
- **Fase B — identidade** ✅ (token de dispositivo sem password: reivindicar + ligar com código).
- **Fase C — carreiras & Hall da Fama** ✅ (página Hall da Fama: campeões por edição, tabela de
  todos os tempos com títulos/pódios/pontos, recordes; agregação entre edições via `/api/halloffame`).
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
- [x] **Mercados extra** (motor + API + testes + **UI** ✅): definidos na config (ex.: surpresa do
      torneio, maior desilusão), passo "Extras" na aposta e resolução no admin. Cada acerto vale os
      pontos do mercado (testado: +3 ao resolver corretamente).
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

## Utilizadores — Fase B ✅
- [x] Identidade por **token de dispositivo, sem password**: reivindicar o nome (gera código de 6
      dígitos) e ligar outros dispositivos com esse código. `data/identities.json` (com .bak). Boot
      reconhece o token e auto-identifica o jogador em toda a app.
- [x] Página pessoal liga as apostas da pessoa em todas as edições (`/api/player`).

## Ideias minhas (extra)
- [x] Gráfico da posição ao longo das jornadas (página **Evolução**, replay por jornada).
- [x] Comparar dois jogadores lado a lado (página **Frente a frente**).
- [x] Simulador "e se?" — página **E se?**, projeta a classificação dos jogos que faltam.
- [x] Cartão de jogador partilhável (PNG) para o WhatsApp (página **Cartão**).
- [ ] Estatísticas: mais "chalk" vs mais contrário ao campo; média de pontos; melhor aposta.
- [ ] Contagem decrescente para o próximo prazo de apostas.
- [ ] Transparência do desempate ("porque está esta equipa à frente").
- [ ] Multi-idioma (PT/EN) para abrir a mais gente.
