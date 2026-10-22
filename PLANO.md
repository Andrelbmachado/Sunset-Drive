# PLANO — Sunset Drive

## Fase 1 — Base sólida
- [x] CI (GitHub Actions): `npm ci`, `npm run build`, `npm run test:sites` em todo PR (hoje só existe o deploy). — `.github/workflows/ci.yml` roda em `pull_request`, `push` na `main` e `workflow_dispatch`; também executa o teste de fumaça.
- [x] Teste de fumaça headless: abrir o build, clicar em JOGAR, dirigir 10 s, falhar se houver erro no console. — `tests/smoke.test.mjs` (Playwright + Chromium) via `npm run test:smoke`; sobe o `dist/client` num servidor estático mínimo, clica em `#race-start`, segura ↑ por 10 s e falha se a velocidade não subir ou houver erro/`pageerror` no console. App expõe `window.__sunsetReady`/`window.__sunsetTelemetry` só para leitura do teste.
- [ ] Chrome DevTools MCP para o agente medir FPS e ler erros de WebGL. — ferramenta do agente, sem artefato de código no repositório; fica para configuração do ambiente.

## Fase 2 — Performance
- [ ] Medir FPS/draw calls (stats.js) em notebook comum.
- [ ] `InstancedMesh` para prédios, palmeiras, moedas e trânsito.
- [ ] Compressão dos `.glb` (Draco/Meshopt) e texturas KTX2.
- [ ] Pool de objetos para tiros e partículas; carregar áudio sob demanda.

## Fase 3 — Carros e componentes
- [ ] Modelos 3D low-poly para os carros secundários (3–5 variações, cores aleatórias).
- [ ] Separar `scene.js` em módulos: estrada, trânsito, jogador, HUD, efeitos.
- [ ] Componentes React para menus/HUD reaproveitáveis.

## Fase 4 — A "brisa GTA"
- [ ] Câmera em 1ª pessoa (de dentro do carro) alternável com a de perseguição.
- [ ] Rádio com estações synthwave (músicas livres de direitos).
- [ ] Ciclo pôr do sol → noite; chuva leve.
- [ ] Efeitos de impacto ("juice"): tremor de câmera, faíscas, hit-stop curto.

## Fase 5 — Divulgação
- [ ] Mais screenshots e GIF de gameplay no README.
- [ ] Página no itch.io.
