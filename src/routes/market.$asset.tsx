import { createFileRoute, redirect } from "@tanstack/react-router";
import { ASSETS, type Asset } from "@/awuru/constants.ts";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/market/$asset")({
  beforeLoad: ({ params }) => {
    const a = params.asset.toUpperCase();
    if (!(ASSETS as readonly string[]).includes(a)) throw redirect({ to: "/" });
  },
  component: MarketPage,
});

function MarketPage() {
  const { asset } = Route.useParams();
  return <DeskApp surface="market" asset={asset.toUpperCase() as Asset} />;
}
