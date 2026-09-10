import { createFileRoute } from "@tanstack/react-router";
import { healthReport, jsonResponse, optionsResponse } from "@/awuru/backend.ts";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async () => {
        const report = await healthReport();
        return jsonResponse(report, report.ok ? 200 : 503);
      },
    },
  },
});
