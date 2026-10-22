# Sunset Drive 🌅🚗

**Um jogo grátis pra dirigir sem pressa por uma estrada synthwave ao pôr do sol — direto no navegador.**

Nasceu de uma brisa jogando GTA V: aquele momento em que você só quer pegar o carro e dirigir, com música tocando e a cidade passando. Sunset Drive tenta transmitir essa sensação sem cadastro, sem custo e sem instalar nada.

![Tela inicial do Sunset Drive](docs/screenshots/menu.png)

## Por que jogar
- **Relaxar, não competir.** O trânsito é pensado para que sempre exista um caminho livre em velocidade máxima: você costura entre os carros em vez de frear.
- **Estética synthwave.** Grade neon rosa, céu de pôr do sol, palmeiras em silhueta e skyline surgindo da névoa.
- **Abre e joga.** Roda em qualquer navegador moderno com WebGL; é só clicar em **JOGAR**.

## O que já tem
**Carro e direção**
- Supercarro detalhado em Three.js, com câmera de perseguição.
- Câmbio de 5 marchas, torque progressivo e velocímetro circular (anel de velocidade + anel de torque).
- Suspensão que comprime e volta, luz neon embaixo do carro, setas sequenciais nas lanternas e "backfire" nos escapamentos ao arrancar forte.

**Estrada e cenário**
- Pista em grade neon, palmeiras e prédios (com níveis de detalhe) aparecendo aos poucos na névoa.
- Trânsito que troca de faixa, faz fila e ultrapassa — mas nunca desvia de você. Colisões empurram os carros de verdade.

**Diversão**
- Canhão neon: toque em Espaço para atirar ou segure para metralhar; carros atingidos saem girando da pista.
- Moedas douradas em filas organizadas por faixa.
- Rampas laterais com placas de aviso antes de cada salto.
- Placar com carros atingidos e moedas coletadas.

**Interface**
- Configurações de volume (música e efeitos separados) e de câmera (distância, ângulo e altura).
- Painel de comandos (botão **?**), botão de som e tela cheia.
- Publicação automática no GitHub Pages a cada push na `main`.

## Como jogar
| Ação | Tecla |
|---|---|
| Acelerar / frear e ré | ↑ ↓ ou W S |
| Dirigir | ← → ou A D |
| Escolher marcha | 1 – 5 |
| Canhão neon (segure para metralhar) | Espaço |
| Tela cheia | F |

> Dica: passe por cima da rampa lateral quando ela aparecer. E dizem que há um segredo para quem insistir no ar… 😉

## Rodar localmente
Requer Node.js 20+.

```bash
npm install
npm run dev         # servidor de desenvolvimento (Vite)
npm run build       # build de produção em dist/
npm run preview     # serve o build localmente
npm run test:sites  # testes do worker de hospedagem
npm run test:smoke  # fumaça headless (precisa do build + Chromium do Playwright)
```

Com `npm run dev` aberto, `tests/passage.html` roda os testes visuais do sistema de trânsito no navegador.

## Tecnologias
- [Three.js](https://threejs.org/) para a cena 3D (`src/scene.js`).
- React 19 + Vite para menus e HUD (`src/App.jsx`).
- Web Audio para os efeitos sintetizados (`src/audio.js`); trilha em `public/assets/game-sfx.mp3`.

## Estrutura
```
src/        jogo (cena 3D, HUD, áudio, estilos)
public/     modelos .glb, texturas e trilha
tests/      testes do worker e do trânsito
worker/     worker de hospedagem (Sites)
docs/       screenshots
```

Para o teste de fumaça, rode `npm run build` antes e, na primeira vez, `npx playwright install chromium`. A CI (`.github/workflows/ci.yml`) roda build, `test:sites` e `test:smoke` em todo PR.

## Roadmap
Nada abaixo existe ainda no código — tudo está **planejado**:
- **Planejado:** CI rodando build e testes em todo PR.
- **Planejado:** mais desempenho (meta de 60 FPS em notebook comum).
- **Planejado:** modelos 3D para os carros do trânsito.
- **Planejado:** câmera em 1ª pessoa (de dentro do carro).
- **Planejado:** rádio com estações, ciclo pôr do sol → noite e novos cenários.

Plano detalhado, com critérios de pronto, em **[PLANO.md](PLANO.md)**. Histórico de desenvolvimento em [progress.md](progress.md).

---

> README e PLANO.md revisados em 21/10/2026 e conferidos contra o código. Itens marcados como **planejado** ainda não existem.
