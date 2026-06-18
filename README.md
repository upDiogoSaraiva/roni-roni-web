# Roni Roni — app do pool

App web (protótipo) do pool **Torneio Roni Roni** do Mundial 2026, pensada para substituir o
Excel partilhado. **Mobile-first** (abre-se pelo link no telemóvel a partir do WhatsApp) e também
responsiva em desktop.

Conteúdo **estritamente neutro**: apostas, resultados e pontos. Sem probabilidades, recomendações
ou qualquer output de motor de decisão. Repositório separado e autónomo.

## O que faz (4 áreas)
- **Apostar** — formulário guiado por passos com barra de progresso: identificação (escolher-se da
  lista dos 27 ou nome novo; PIN opcional) → Campeão → Final 4 → 12 grupos (1.º e 2.º) → 8 melhores
  3.os → revisão → sucesso. Selects pesquisáveis, validação inline, edição da própria aposta.
- **Geral** — leaderboard ao vivo: posição, pontos, indicador de movimento, destaque do topo,
  ordenável, pesquisa, e folha pública ao expandir cada jogador.
- **Resultados** — jogos por jornada, classificação por grupo (top-2 + 8 melhores 3.os) e pontos
  distribuídos.
- **Admin** — grelha de todas as apostas (pesquisa/filtro), estado das submissões, edição de
  resultados (botão **Gravar** por grupo, recalcula tudo), **Buscar resultados** (importa de uma
  fonte) e abrir/fechar a janela. Password simples.

### Buscar resultados (fetch)
O botão *Buscar resultados* (Admin) corre `loadResultsSource()` e sincroniza a fase de grupos a
partir de uma fonte, por ordem:
1. `RESULTS_SOURCE_URL` — um feed JSON `{ "groups": { "A": [{home,away,homeGoals,awayGoals,matchday}] } }`;
2. `data/results_source.json` — ficheiro local que o organizador mantém (por defeito, os resultados
   reais conhecidos, J1).

Não inventa resultados — só importa o que a fonte fornece. Atualizar a fonte (ou apontar o URL a um
feed real) e clicar *Buscar resultados* traz os jogos novos e recalcula a classificação.
CLI equivalente: `node scripts/fetch_results.mjs` (escreve em `data/store.json`).

## Stack
Node ≥ 20, **zero dependências** (servidor em `node:http`, persistência em JSON). Frontend vanilla
sem build. Arranca com um comando.

## Correr
```bash
npm run seed     # (opcional) regenera data/seed.json a partir dos dados reais
npm start        # arranca em http://0.0.0.0:4026
```
Variáveis: `PORT` (4026), `HOST` (0.0.0.0), `ADMIN_PASSWORD` (`roni2026` por defeito).

Estado mutável (apostas + resultados + janela) vive em `data/store.json`, criado no 1.º arranque a
partir de `data/seed.json` (as 27 apostas reais + os resultados reais pós-jornada 1). Para repor o
estado inicial: apagar `data/store.json` e reiniciar.

## Partilhar fora da rede (túnel temporário)
O servidor faz bind a `0.0.0.0`, por isso já é acessível na LAN em `http://<ip-local>:4026`.
Para um link público temporário, com o servidor a correr:
```bash
# cloudflared (sem conta):
cloudflared tunnel --url http://localhost:4026

# ou ngrok (requer conta/token):
ngrok http 4026
```
Qualquer um imprime um URL `https://…` para enviar a um amigo.

## Dados e pontuação
- **Dados reais**: 48 seleções por grupo (A–L), 27 apostas reais e os resultados reais conhecidos,
  importados dos dados do pool. Bandeiras SVG locais em `public/flags/` (domínio público).
- **Pontuação implementada de raiz** a partir do regulamento (ver `src/scoring.mjs`, testes em
  `src/scoring.test.mjs` — `npm test`):
  - +1 por cada equipa corretamente identificada como **apurada** (top-2 do grupo ou um dos
    **8 melhores 3.os**), contada uma vez por equipa.
  - +1 por **posição** exata (1.º/2.º; o 3.º só conta se entrar nos 8 melhores 3.os).
  - Campeão = 8 e cada seleção do Final 4 = 3 (resolvem nas eliminatórias; 0 durante os grupos).
  - Classificação de grupo por 3/1/0, desempate por DG, golos marcados e nome.

Durante a fase de grupos a classificação é **provisória/ao vivo**: recalcula a cada resultado
inserido no Admin.

## Design
Ver [`DESIGN_WEB.md`](DESIGN_WEB.md) — identidade própria (paleta *ember* + ouro escasso, neutros
quentes; Space Grotesk / Hanken Grotesk / DM Mono), mobile-first, todos os estados tratados,
acessível, sem sinais de UI gerada por AI. Sem branding oficial do torneio.

## Estrutura
```
server.mjs            servidor (http + API + estáticos + persistência JSON)
src/scoring.mjs       motor de pontuação (de raiz) + testes
scripts/build_seed.mjs   CSV/JSON reais -> data/seed.json
scripts/fetch_flags.mjs  descarrega os 48 SVGs de bandeira
public/               SPA (index.html, styles.css, app.js, flags/)
data/                 groups.json, field_2026_real.csv, seed.json, store.json (runtime)
```
