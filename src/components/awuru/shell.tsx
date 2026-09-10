import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, LayoutGrid, NotebookPen } from "lucide-react";
import { ENGINE_VERSION } from "@/awuru/constants.ts";
import { useSession } from "@/awuru/session.ts";
import { Palette } from "@/components/awuru/palette.tsx";
import { cn } from "@/lib/utils.ts";

function useCountdown(target: number | null) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => setLeft(target ? Math.max(0, target - Date.now()) : 0);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [target]);
  const s = Math.floor(left / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function TerminalShell({ children }: { children: ReactNode }) {
  const hydrate = useSession((s) => s.hydrate);
  const ready = useSession((s) => s.ready);
  const setFocused = useSession((s) => s.setFocused);
  const focused = useSession((s) => s.focused);
  const nextCloseAt = useSession((s) => s.nextCloseAt);
  const scanning = useSession((s) => s.scanning);
  const pulse = useSession((s) => s.pulse);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const clock = useCountdown(nextCloseAt);

  useEffect(() => {
    if (!ready) void hydrate();
  }, [ready, hydrate]);

  useEffect(() => {
    const onVis = () => setFocused(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      setFocused(false);
    };
  }, [setFocused]);

  const nav = [
    { to: "/", label: "Desk", icon: LayoutGrid, match: path === "/" },
    { to: "/ledger", label: "Ledger", icon: NotebookPen, match: path.startsWith("/ledger") },
    { to: "/audit", label: "Audit", icon: BookOpen, match: path.startsWith("/audit") },
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel">Discipline desk</p>
            <h1 className="text-lg font-medium tracking-tight md:text-xl">AWURU v7</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider", focused ? "border-up/40 text-up" : "border-wait/40 text-wait")}>
              {focused ? "session live" : "not monitoring"}
            </span>
            <span className={cn("rounded-full border border-border px-2.5 py-1 font-mono text-[10px] tabular-nums", pulse ? "pulse-state text-fg" : "text-subtle")}>
              15m {clock}
            </span>
            <span className="hidden font-mono text-[10px] text-subtle sm:inline">{ENGINE_VERSION}</span>
            <a href="/api/health" className="hidden rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-subtle sm:inline">
              backend
            </a>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-7xl gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium md:flex-none md:px-4",
                n.match ? "bg-raised text-fg" : "text-muted hover:bg-surface hover:text-fg",
              )}
            >
              <n.icon className="size-4" aria-hidden />
              {n.label}
            </Link>
          ))}
          {scanning && <span className="ml-auto hidden items-center font-mono text-[10px] uppercase tracking-wider text-subtle sm:flex">updating</span>}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-8">{ready ? children : <p className="font-mono text-sm text-muted">Restoring last observed state…</p>}</main>
      <Palette />
    </div>
  );
}
