import type { RaAck, RaCommand } from "@/lib/services/remoteAssist";

// The client's command queue (contract §11, §12, §20 steps 2 and 10–11):
// commands run one at a time in creation order; an id is marked handled
// before it runs, so a reload, a reconnect or a second delivery (socket and
// poll) never runs it again; and each command gets exactly one final
// acknowledgement. Only ids are kept, never payloads.

// Statuses the backend has already settled: nothing left to run.
const SETTLED = new Set(["executed", "rejected", "confirmed", "cancelled", "expired", "confirmation_required", "failed"]);

export type RaRunnerDeps = {
  handled: { has: (id: string) => boolean; mark: (id: string) => void };
  // False while the session is not live on this tab (paused, ended, hidden).
  canRun: () => boolean;
  // Runs one command; `shown` sends confirmation_required when the client's
  // confirmation sheet is on screen.
  execute: (cmd: RaCommand, shown: () => Promise<void>) => Promise<RaAck>;
  ack: (cmd: RaCommand, ack: RaAck) => Promise<void>;
  // After the final ack (publish the next revision, show the last action).
  after?: (cmd: RaCommand, ack: RaAck) => void;
};

export type RaRunner = {
  enqueue: (list: RaCommand[]) => void;
  drain: () => Promise<void>;
  clear: () => void;
  size: () => number;
};

export function createRaRunner(deps: RaRunnerDeps): RaRunner {
  let queue: RaCommand[] = [];
  let running = false;

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (queue.length && deps.canRun()) {
        const cmd = queue.shift() as RaCommand;
        if (deps.handled.has(cmd.id)) continue;
        deps.handled.mark(cmd.id);
        let required = false;
        const ack = await deps.execute(cmd, async () => {
          if (required) return;
          required = true;
          await deps.ack(cmd, { status: "confirmation_required", result: { presented: true } });
        });
        await deps.ack(cmd, ack);
        deps.after?.(cmd, ack);
      }
    } finally {
      running = false;
    }
  };

  return {
    enqueue: (list) => {
      for (const c of list) {
        if (!c.id || deps.handled.has(c.id) || SETTLED.has(c.status) || queue.some((q) => q.id === c.id)) continue;
        queue.push(c);
      }
      queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      void drain();
    },
    drain,
    clear: () => {
      queue = [];
    },
    size: () => queue.length,
  };
}
