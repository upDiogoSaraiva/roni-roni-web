# Roni Roni

App web do pool de apostas Torneio Roni Roni para o Mundial de 2026. Veio substituir a folha de
Excel que o grupo usava. Cada pessoa faz a aposta no telemóvel e segue a classificação à medida
que vão saindo os resultados.

<p align="center">
  <img src="docs/leaderboard.png" width="31%" alt="Classificação geral" />
  <img src="docs/apostar.png" width="31%" alt="Submissão de apostas" />
  <img src="docs/resultados.png" width="31%" alt="Resultados por grupo" />
</p>

## Funcionalidades

- Formulário de aposta por passos: campeão, Final 4, 1.º e 2.º de cada grupo e os 8 melhores
  terceiros. Valida à medida que se preenche e mostra um resumo antes de confirmar.
- Classificação ao vivo, ordenável e com pesquisa. Cada linha abre para ver a folha do jogador e a
  origem dos pontos.
- Resultados por grupo e quadro do mata-mata.
- No mata-mata aposta-se ronda a ronda no vencedor, na fase em que o jogo acaba (tempo
  regulamentar, prolongamento ou penáltis) e há 2 jokers.
- Área de administração com palavra-passe para inserir resultados, abrir e fechar as janelas de
  aposta e consultar as apostas de toda a gente.
- Os resultados reais são importados da ESPN, sem chave de API. Tem tema claro e escuro.

## Stack

Node.js 20+, sem dependências. O servidor assenta no módulo `node:http` e guarda o estado num
ficheiro JSON. O frontend é uma SPA em JavaScript, sem passo de build.

## Arranque

```bash
git clone https://github.com/upDiogoSaraiva/roni-roni-web.git
cd roni-roni-web
npm start
```

Fica disponível em `http://localhost:4026`. No primeiro arranque cria `data/store.json` a partir de
`data/seed.json`. Para voltar ao estado inicial, apaga esse ficheiro. Para regenerar os
dados-semente a partir das fontes originais, corre `npm run seed`.

## Configuração

Tudo opcional, por variáveis de ambiente:

| Variável | Por omissão | Para quê |
| --- | --- | --- |
| `PORT` | `4026` | Porta do servidor. |
| `HOST` | `0.0.0.0` | Interface de bind (fica acessível na rede local). |
| `ADMIN_PASSWORD` | `roni2026` | Palavra-passe da administração. |
| `RESULTS_SOURCE_URL` | (nenhum) | Feed JSON alternativo para os resultados. |

## Sistema de pontos

Está implementado a partir do regulamento, em [`src/scoring.mjs`](src/scoring.mjs).

Na fase de grupos, cada equipa acertada como apurada (1.º, 2.º ou um dos 8 melhores terceiros) vale
1 ponto, e a posição final certa no grupo vale mais 1.

No mata-mata aposta-se ronda a ronda:

| Ronda | Vencedor | Fase certa |
| --- | --- | --- |
| 16-avos, 8-avos, quartos | 2 | +1 |
| Meias e 3.º/4.º | 4 | +2 |
| Final | 6 | +3 |

A fase só conta se o vencedor estiver certo. Cada um dos 2 jokers (16-avos a quartos) duplica os
pontos de um jogo. As apostas iniciais valem 8 pontos pelo campeão e 3 por cada seleção do Final 4.
Enquanto os grupos não fecham, a classificação é provisória e refaz-se a cada resultado novo.

## Fonte de resultados

O botão *Buscar resultados*, na administração, vai buscar os jogos a uma fonte real. Tenta por esta
ordem:

1. `RESULTS_SOURCE_URL`, se estiver definido. Espera um feed JSON no formato
   `{ "groups": { "A": [{ "home": "...", "away": "...", "homeGoals": 0, "awayGoals": 0 }] } }`.
2. A API pública da ESPN (`fifa.world`), que não precisa de chave. É a fonte por omissão, tanto para
   os grupos como para o mata-mata, e cruza as seleções pelo código FIFA.
3. `data/results_source.json`, um ficheiro local, caso a fonte online esteja indisponível.

Só entram jogos terminados. O mesmo trabalho dá-se pela linha de comandos com
`node scripts/fetch_results.mjs`.

## Estrutura do projeto

```
roni-roni-web/
├── server.mjs              servidor HTTP, API e persistência em JSON
├── data/
│   ├── groups.json         as 48 seleções por grupo (A–L)
│   ├── bracket.json        cruzamento oficial do mata-mata
│   ├── field_2026_real.csv apostas reais (origem dos dados-semente)
│   └── seed.json           estado inicial gerado
├── src/
│   ├── scoring.mjs         pontuação de grupos e mata-mata, com testes
│   ├── bracket.mjs         resolução dos cruzamentos do mata-mata
│   └── results_source.mjs  fonte de resultados ao vivo
├── scripts/                geração dos dados-semente, bandeiras e fetch
└── public/                 SPA (HTML, CSS, JavaScript e bandeiras SVG)
```

As decisões de design da interface estão em [`DESIGN_WEB.md`](DESIGN_WEB.md).

## Testes

```bash
npm test
```

Os testes cobrem o motor de pontuação: pontos de grupo, a regra dos 8 melhores terceiros, a não
dupla contagem, a pontuação do mata-mata com jokers e a atribuição dos terceiros ao bracket.

## Notas

É um projeto privado, para uso do grupo. Os dados têm nomes reais dos participantes, por isso o
repositório fica privado. As bandeiras vêm do [flag-icons](https://github.com/lipis/flag-icons)
(domínio público). Não há logótipos nem marcas oficiais do torneio.
