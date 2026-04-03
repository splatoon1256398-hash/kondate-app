"use client";

import { Plus } from "lucide-react";

type Props = {
  date: string;
  mealType: "lunch" | "dinner";
};

export default function EmptySlot({ mealType }: Props) {
  return (
    <button
      type="button"
      className="flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-card/20 p-2.5 text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <Plus size={16} />
      <span className="text-[10px]">
        {mealType === "lunch" ? "昼" : "夜"}
      </span>
    </button>
  );
}
