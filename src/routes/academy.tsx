import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/academy")({ component: AcademyPage });

function AcademyPage() {
  return <DeskApp surface="academy" />;
}
