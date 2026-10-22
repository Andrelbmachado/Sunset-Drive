# PLANO — Sunset Drive

Cada item tem um **pronto quando** verificável. Fases são feitas em ordem; dentro de uma fase, os itens podem ir em paralelo. Uma branch + PR por item.

**Regra geral:** nenhuma mudança pode quebrar as decisões registradas em `AGENTS.md` (trânsito que nunca desvia, sempre haver passagem, sem `transmission` nos materiais etc.). Todo PR roda `npm run build` e `npm run test:sites` antes do merge.

## Ponto de partida (já existe)
- Deploy automático no GitHub Pages (`.github/workflows/deploy-pages.yml`), só em push na `main`.
- Testes: `tests/sites-worker.test.mjs` (Node) e `tests/passage.html` (manual, no navegador).
- Pools fixos já em uso: tiros (`SHOT_POOL_SIZE = 8`), explosões (`BURST_POOL_SIZE`), moedas e trânsito (`TRAFFIC_POOL_SIZE = 32`).
- Prédios distantes já usam geometria mesclada (`mergeGeometries`).
- `render_game_to_text` expõe o estado do jogo para inspeção automatizada.

## Fase 1 — Base sólida
- [ ] **CI em PR.** Novo `.github/workflows/ci.yml` em `pull_request`: `npm ci`, `npm run build`, `npm run test:sites`, e checar que existem `dist/client/index.html`, `dist/server/index.js` e `dist/.openai/hosting.json`.
  *Pronto quando:* um PR mostra o check verde e um PR com build quebrado mostra vermelho.
- [ ] **Teste de fumaça headless.** Script `tests/smoke.mjs` (Playwright) que sobe `npm run preview`, clica em `#race-start`, segura ↑ por 10 s e falha se houver erro no console ou se `render_game_to_text` não mostrar velocidade > 0. Adicionar `npm run test:smoke` e incluir no CI.
  *Pronto quando:* roda localmente e no CI em menos de 2 min.
- [ ] **Automatizar `tests/passage.html`.** Rodar a página no mesmo Playwright e falhar se algum caso não passar.
  *Pronto quando:* o CI quebra se um caso de passagem falhar.

## Fase 2 — Performance (meta: 60 FPS em notebook comum)
- [ ] **Medir antes de otimizar.** Overlay de debug opcional (`?debug=1`) com FPS, draw calls e triângulos (`renderer.info`). Registrar números de referência em `progress.md`.
  *Pronto quando:* existe uma tabela "antes" com FPS médio e draw calls em 60 s de corrida.
- [ ] **`InstancedMesh` para palmeiras, prédios GLB próximos e moedas** (hoje são meshes individuais).
  *Pronto quando:* draw calls caem ≥ 50% sem mudança visual (comparar screenshots).
- [ ] **Compressão dos assets.** `palm.glb` e `building.glb` com Meshopt (`gltf-transform`) e texturas `.png` grandes em KTX2/WebP. O GLB original da palmeira continua intocado no repo (regra do `AGENTS.md`) — gerar a versão comprimida como arquivo novo.
  *Pronto quando:* `public/assets` encolhe de forma mensurável e o carregamento inicial fica mais rápido.
- [ ] **Áudio sob demanda.** Carregar `game-sfx.mp3` só após o clique em JOGAR.
  *Pronto quando:* o mp3 não aparece na aba Network antes do clique.

## Fase 3 — Carros e organização do código
- [ ] **Separar `src/scene.js`** (~3300 linhas) em módulos: `road.js`, `traffic.js`, `player.js`, `ramp.js`, `coins.js`, `shots.js`, `scenery.js`. Só mover código, sem mudar comportamento.
  *Pronto quando:* nenhum arquivo passa de ~800 linhas e smoke test + `passage.html` continuam verdes.
- [ ] **Carros do trânsito em 3D low-poly.** 3–5 modelos `.glb` com cor aleatória, mantendo as mesmas dimensões de colisão e a escala por `taperAt(z)`.
  *Pronto quando:* os carros novos aparecem e `passage.wallSlice` continua em -1 em corridas longas.
- [ ] **Componentes React reaproveitáveis** para painéis e botões de ícone (`Panel`, `IconButton`, `Slider`), extraídos de `App.jsx`.

## Fase 4 — A "brisa GTA"
- [ ] **Câmera em 1ª pessoa**, alternável com a de perseguição (tecla `C` + opção nas configurações). Adicionar ao painel de comandos.
  *Pronto quando:* dá para alternar a qualquer momento sem saltos de câmera.
- [ ] **Rádio synthwave.** 3+ faixas livres de direitos, troca com a tecla `R`, nome da faixa no HUD. Documentar licenças em `public/assets/CREDITS.md`.
- [ ] **Ciclo pôr do sol → noite** em ~5 min, interpolando céu, névoa e luz direcional.
- [ ] **"Juice" de impacto:** tremor curto de câmera, faíscas e hit-stop de ~50 ms em colisões e acertos do canhão (com opção de desligar o tremor).

## Fase 5 — Divulgação
- [ ] Screenshots da corrida, da rampa e do canhão em `docs/screenshots/`, mais um GIF de 10 s no topo do README.
- [ ] Link do jogo publicado (GitHub Pages) no topo do README e na descrição do repositório.
- [ ] Página no itch.io com o build web embutido.
