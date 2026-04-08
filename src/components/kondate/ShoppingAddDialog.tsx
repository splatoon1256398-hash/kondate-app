"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus } from "lucide-react";
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
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-bg-grouped-secondary py-3 text-[15px] font-medium text-blue active:bg-fill-tertiary"
        >
          <Plus size={16} strokeWidth={2} />
          アイテムを追加
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
          {/* Grab bar */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-gray3" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <Dialog.Close className="text-[17px] text-blue active:opacity-60">
              キャンセル
            </Dialog.Close>
            <Dialog.Title className="text-[17px] font-semibold text-label">
              アイテムを追加
            </Dialog.Title>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="text-[17px] font-semibold text-blue active:opacity-60 disabled:opacity-30"
            >
              追加
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 px-4 pb-6 pt-3">
            {/* Name + amount in grouped list */}
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              <div className="flex min-h-[44px] items-center px-4">
                <span className="w-20 shrink-0 text-[17px] text-label">食材名</span>
                <input
                  type="text"
                  placeholder="必須"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-transparent py-3 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex min-h-[44px] items-center px-4">
                <span className="w-20 shrink-0 text-[17px] text-label">数量</span>
                <input
                  type="number"
                  placeholder="任意"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  step="any"
                  className="flex-1 bg-transparent py-3 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="単位"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-16 bg-transparent text-right text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <h3 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
                カテゴリ
              </h3>
              <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        category === c.value
                          ? "bg-blue text-white"
                          : "bg-fill text-label"
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
