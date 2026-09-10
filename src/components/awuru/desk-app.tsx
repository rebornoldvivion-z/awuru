import { TerminalShell } from "@/components/awuru/shell.tsx";
import { CommandCenter } from "@/components/awuru/command-center.tsx";
import { Workstation } from "@/components/awuru/workstation.tsx";
import { LedgerView } from "@/components/awuru/ledger-view.tsx";
import { AuditView } from "@/components/awuru/audit-view.tsx";
import type { Asset } from "@/awuru/constants.ts";

export function DeskApp({ surface, asset }: { surface: "desk" | "plan" | "journal" | "academy" | "ledger" | "audit" | "market"; asset?: Asset }) {
  return (
    <TerminalShell>
      {(surface === "desk" || surface === "plan") && <CommandCenter />}
      {surface === "market" && asset && <Workstation asset={asset} />}
      {(surface === "journal" || surface === "ledger") && <LedgerView />}
      {(surface === "academy" || surface === "audit") && <AuditView />}
    </TerminalShell>
  );
}
