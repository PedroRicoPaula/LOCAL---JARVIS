"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ApprovalRequest } from "@/lib/types";
import { Panel } from "./panel";

function timeLeft(expiresAt: number): string {
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "expiring";
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s left` : `${s}s left`;
}

export function ApprovalQueue({
  approvals,
  onDecide,
}: {
  approvals: ApprovalRequest[];
  onDecide: (request: ApprovalRequest, decision: "approve" | "reject") => void;
}) {
  return (
    <Panel title={`Approval Queue${approvals.length ? ` (${approvals.length})` : ""}`} className="lg:flex-1 lg:min-h-0 flex flex-col shrink-0">
      {approvals.length === 0 ? (
        <div className="text-[10px] text-jarvis-dim">Nothing pending.</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-48 lg:max-h-none">
          {approvals.map((request) => (
            <div key={request.id} className="fade-in-up border border-jarvis-amber/30 bg-jarvis-amber/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] tracking-wider text-jarvis-amber uppercase">{request.capability}</span>
                <span className="text-[8px] text-jarvis-dim">{timeLeft(request.expiresAt)}</span>
              </div>
              <div className="text-[10px] text-jarvis-text leading-snug mt-1">{request.humanSummary}</div>
              <div className="flex items-center justify-between mt-2 gap-2">
                <Dialog>
                  <DialogTrigger
                    render={
                      <Button size="xs" variant="ghost" className="text-[9px] text-jarvis-dim px-0 h-auto">
                        expand
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{request.capability}</DialogTitle>
                      <DialogDescription>{request.humanSummary}</DialogDescription>
                    </DialogHeader>
                    <pre className="text-[10px] whitespace-pre-wrap break-all bg-black/30 p-2 rounded max-h-64 overflow-y-auto">
                      {JSON.stringify(request.payload, null, 2)}
                    </pre>
                    {request.diff ? (
                      <pre className="text-[10px] whitespace-pre-wrap break-all bg-black/30 p-2 rounded max-h-64 overflow-y-auto">
                        {request.diff}
                      </pre>
                    ) : null}
                    <DialogFooter>
                      <Button variant="destructive" size="sm" onClick={() => onDecide(request, "reject")}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => onDecide(request, "approve")}>
                        Approve
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <div className="flex gap-2">
                  <Button size="xs" variant="destructive" onClick={() => onDecide(request, "reject")}>
                    Reject
                  </Button>
                  <Button size="xs" onClick={() => onDecide(request, "approve")}>
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
