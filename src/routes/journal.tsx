import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/journal")({ component: JournalPage });

function JournalPage() {
  return <DeskApp surface="journal" />;
}
