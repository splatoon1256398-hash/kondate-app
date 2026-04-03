"use client";

import { Check } from "lucide-react";
import type { ShoppingItemResponse } from "@/types/shopping-list";

type Props = {
  item: ShoppingItemResponse;
  onToggle: (item: ShoppingItemResponse) => void;
};

export default function ShoppingItem({ item, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        item.is_checked
          ? "bg-card/30 opacity-50"
          : "bg-card hover:bg-card-hover"
      }`}
    >
      {/* Checkbox */}
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          item.is_checked
            ? "border-green bg-green/20 text-green"
            : "border-border"
        }`}
      >
        {item.is_checked && <Check size={12} strokeWidth={3} />}
      </span>

      {/* Name */}
      <span
        className={`flex-1 text-sm ${
          item.is_checked ? "text-muted line-through" : ""
        }`}
      >
        {item.name}
      </span>

      {/* Amount */}
      {item.amount != null && (
        <span className="shrink-0 text-xs text-muted">
          {item.amount}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
      )}

      {/* Checked by */}
      {item.is_checked && item.checked_by && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            item.checked_by === "れん"
              ? "bg-blue/10 text-blue"
              : "bg-green/10 text-green"
          }`}
        >
          {item.checked_by}
        </span>
      )}
    </button>
  );
}
