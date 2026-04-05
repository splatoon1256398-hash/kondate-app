"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import type { ItemCategory } from "@/types/shopping-list";

type Props = {
  onAdd: (item: { name: string; amount?: number; unit?: string; category: ItemCategory }) => void;
};

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "meat_fish", label: "肉・魚" },
  { value: "vegetable", label: "野菜" },
  { value: "tofu_natto", label: "豆腐・練り物" },
  { value: "dairy_egg", label: "乳製品・卵" },
  { value: "dry_goods", label: "乾物・缶詰" },
  { value: "seasoning", label: "調味料" },
  { value: "frozen", label: "冷凍食品" },
  { value: "other", label: "その他" },
];

export default function ShoppingAddDialog({ onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState<ItemCategory>("other");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    onAdd({
      name: name.trim(),
      amount: amount ? parseFloat(amount) : undefined,
      unit: unit || undefined,
      category,
    });

    setName("");
    setAmount("");
    setUnit("");
    setCategory("other");
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Plus size={16} />
          追加
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold">
              アイテムを追加
            </Dialog.Title>
            <Dialog.Close className="text-muted hover:text-foreground">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="食材名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              autoFocus
            />

            <div className="flex gap-2">
              <input
                type="number"
                placeholder="数量"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="any"
                className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <input
                type="text"
                placeholder="単位"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    category === c.value
                      ? "bg-accent text-background"
                      : "bg-background text-muted border border-border"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              追加する
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
