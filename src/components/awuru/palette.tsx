import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/awuru/session.ts";

export function Palette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const setAsset = useSession((s) => s.setAsset);
  const scan = useSession((s) => s.scanDesk);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (typing) return;
      if (e.key === "1") {
        setAsset("BTC");
        void nav({ to: "/market/$asset", params: { asset: "BTC" } });
      }
      if (e.key === "2") {
        setAsset("ETH");
        void nav({ to: "/market/$asset", params: { asset: "ETH" } });
      }
      if (e.key === "3") {
        setAsset("GOLD");
        void nav({ to: "/market/$asset", params: { asset: "GOLD" } });
      }
      if (e.key.toLowerCase() === "r") void scan("manual");
      if (e.key.toLowerCase() === "j") void nav({ to: "/ledger" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, scan, setAsset]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-bg/70 p-4" onClick={() => setOpen(false)}>
      <Command
        className="mx-auto mt-24 max-w-lg overflow-hidden rounded-xl border border-border bg-raised shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Command.Input
          autoFocus
          placeholder="Command…"
          className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { setAsset("BTC"); void nav({ to: "/market/$asset", params: { asset: "BTC" } }); setOpen(false); }}>BTC</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { setAsset("ETH"); void nav({ to: "/market/$asset", params: { asset: "ETH" } }); setOpen(false); }}>ETH</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { setAsset("GOLD"); void nav({ to: "/market/$asset", params: { asset: "GOLD" } }); setOpen(false); }}>GOLD PROXY · PAXGUSDT</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { void scan("manual"); setOpen(false); }}>Rescan</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { void nav({ to: "/" }); setOpen(false); }}>Command center</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { void nav({ to: "/ledger" }); setOpen(false); }}>Ledger</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { void nav({ to: "/audit" }); setOpen(false); }}>Audit</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { void nav({ to: "/audit" }); setOpen(false); }}>Data health</Command.Item>
          <Command.Item className="rounded-md px-3 py-2 text-sm aria-selected:bg-surface" onSelect={() => { const a = useSession.getState().asset; void nav({ to: "/market/$asset", params: { asset: a } }); setOpen(false); }}>Current thesis</Command.Item>
        </Command.List>
      </Command>
    </div>
  );
}
