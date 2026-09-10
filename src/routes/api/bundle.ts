import { createFileRoute } from "@tanstack/react-router";
import { bundleReport, jsonResponse, optionsResponse, parseAsset } from "@/awuru/backend.ts";

export const Route = createFileRoute("/api/bundle")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const asset = parseAsset(url.searchParams.get("asset") ?? "BTC");
        if (!asset) {
          return jsonResponse({ ok: false, error: "asset must be BTC or ETH" }, 400);
        }
        const report = await bundleReport(asset);
        return jsonResponse(report, report.ok ? 200 : 503);
      },
    },
  },
});
