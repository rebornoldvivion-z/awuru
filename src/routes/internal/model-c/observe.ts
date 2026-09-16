import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, optionsResponse } from "@/awuru/backend.ts";
import { handleObserverRoute } from "@/awuru/cloud/observer-http.ts";

export const Route = createFileRoute("/internal/model-c/observe")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const result = await handleObserverRoute({
          method: "POST",
          pathname: url.pathname,
          headers: request.headers,
        });
        return jsonResponse(result.json, result.status);
      },
    },
  },
});
