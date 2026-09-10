import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/plan")({ component: PlanPage });

function PlanPage() {
  return <DeskApp surface="plan" />;
}
