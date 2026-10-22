// Teste de fumaça headless (Fase 1 do PLANO.md):
// sobe o build de produção, clica em JOGAR, dirige por ~10 s e falha se
// houver erro no console ou se o carro não ganhar velocidade.
import assert from "node:assert/strict";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "playwright";

const CLIENT_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// Servidor estático mínimo: atende o diretório do build e cai em index.html
// para qualquer rota desconhecida (SPA), sem subir dependências extras.
function startStaticServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(CLIENT_DIR, relative);
    if (!filePath.startsWith(CLIENT_DIR) || !existsSync(filePath) || relative === "/" || relative === "") {
      filePath = join(CLIENT_DIR, "index.html");
    }
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", MIME[extname(filePath)] || "application/octet-stream");
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

test("abre o build, joga por 10 s e não gera erro no console", async (t) => {
  if (!existsSync(join(CLIENT_DIR, "index.html"))) {
    assert.fail("dist/client/index.html ausente — rode `npm run build` antes do teste de fumaça");
  }

  const { server, baseUrl } = await startStaticServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const browser = await chromium.launch();
  t.after(() => browser.close());

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(String(error));
  });

  await page.goto(baseUrl, { waitUntil: "load" });

  // Espera a experiência Three.js sinalizar que terminou de carregar.
  await page.waitForFunction(() => window.__sunsetReady === true, { timeout: 30_000 });

  const startButton = page.locator("#race-start");
  await startButton.waitFor({ state: "visible", timeout: 10_000 });
  await assert.doesNotReject(startButton.click());

  // Dirige por ~10 s segurando a seta para cima (acelerar).
  await page.focus("body");
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(10_000);
  await page.keyboard.up("ArrowUp");

  const speed = await page.evaluate(() => window.__sunsetTelemetry?.speed ?? 0);
  assert.ok(speed > 0, `o carro deveria estar em movimento após 10 s (velocidade=${speed})`);

  assert.deepEqual(
    consoleErrors,
    [],
    `o console não deveria ter erros durante a jogatina:\n${consoleErrors.join("\n")}`,
  );
});
