import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/ledger")({ component: () => <DeskApp surface="ledger" /> });
