import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, optionsResponse } from "@/awuru/backend.ts";
import { handleObserverRoute } from "@/awuru/cloud/observer-http.ts";

export const Route = createFileRoute("/api/model-c/health")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const result = await handleObserverRoute({
          method: "GET",
          pathname: url.pathname,
          headers: request.headers,
        });
        return jsonResponse(result.json, result.status);
      },
    },
  },
});
