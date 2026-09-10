import { createFileRoute } from "@tanstack/react-router";
import { DeskApp } from "@/components/awuru/desk-app.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <DeskApp surface="desk" />;
}
