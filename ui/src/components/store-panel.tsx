"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ShoppingItem, TaskItem } from "@/lib/types";
import { Panel } from "./panel";

/** SOAK 1: live view onto `tasks`/`shopping_list`'s own `ctx.store` tables
 * -- the point is watching a voice-driven write (`ADD_TASK`, `ADD_ITEM`)
 * show up here within one poll interval, and being able to close the loop
 * (mark done, delete) from the dashboard itself, not just by voice. */
export function StorePanel({
  tasks,
  shoppingItems,
  onToggleTask,
  onDeleteTask,
  onDeleteItem,
}: {
  tasks: TaskItem[];
  shoppingItems: ShoppingItem[];
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const [tab, setTab] = useState<"tasks" | "shopping">("tasks");
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);

  return (
    <Panel title="Live Data" className="shrink-0">
      <div className="flex gap-3 mb-2 -mt-1">
        <button
          onClick={() => setTab("tasks")}
          className={`text-[11px] tracking-widest uppercase pb-1 border-b ${tab === "tasks" ? "text-jarvis-cyan border-jarvis-cyan" : "text-jarvis-dim border-transparent"}`}
        >
          Tasks ({openTasks.length})
        </button>
        <button
          onClick={() => setTab("shopping")}
          className={`text-[11px] tracking-widest uppercase pb-1 border-b ${tab === "shopping" ? "text-jarvis-cyan border-jarvis-cyan" : "text-jarvis-dim border-transparent"}`}
        >
          Shopping ({shoppingItems.length})
        </button>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1">
        {tab === "tasks" ? (
          tasks.length === 0 ? (
            <div className="text-[12px] text-jarvis-dim">No tasks yet.</div>
          ) : (
            [...openTasks, ...doneTasks].map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-[12px] group">
                <input type="checkbox" checked={t.done} onChange={() => onToggleTask(t.id)} className="accent-jarvis-cyan" />
                <span className={`flex-1 truncate ${t.done ? "line-through text-jarvis-dim" : "text-jarvis-text"}`}>{t.text}</span>
                <Button size="xs" variant="ghost" className="text-[11px] text-jarvis-dim px-1 h-auto opacity-0 group-hover:opacity-100" onClick={() => onDeleteTask(t.id)}>
                  ×
                </Button>
              </div>
            ))
          )
        ) : shoppingItems.length === 0 ? (
          <div className="text-[12px] text-jarvis-dim">List is empty.</div>
        ) : (
          shoppingItems.map((i) => (
            <div key={i.id} className="flex items-center gap-2 text-[12px] group">
              <span className="flex-1 truncate text-jarvis-text">{i.text}</span>
              <Button size="xs" variant="ghost" className="text-[11px] text-jarvis-dim px-1 h-auto opacity-0 group-hover:opacity-100" onClick={() => onDeleteItem(i.id)}>
                ×
              </Button>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
