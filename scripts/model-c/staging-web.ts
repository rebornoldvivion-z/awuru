/**
 * Render Free web process for Model C scheduled observation.
 * Not the public Command Center. Not a background worker. Not 24/7.
 * Bind PORT from Render, never 8080 (App Builder preview).
 */
import http from "node:http";
import { handleObserverRoute } from "../../src/awuru/cloud/observer-http.ts";

const port = Number(process.env.PORT ?? 8787);
if (port === 8080) {
  throw new Error("staging web must not bind the Model B preview port");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const result = await handleObserverRoute({
    method: req.method ?? "GET",
    pathname: url.pathname,
    headers: req.headers as Record<string, string | undefined>,
  });
  const json = JSON.stringify(result.json);
  res.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`model-c scheduled observer web :${port}`);
});
