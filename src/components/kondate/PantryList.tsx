"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Refrigerator, Plus, Trash2, X, AlertTriangle } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { PantryItem } from "@/types/pantry";
import type { ApiResponse } from "@/types/common";

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; order: number }> = {
  meat_fish:  { label: "肉・魚",     emoji: "\ud83e\udd69", order: 0 },
  vegetable:  { label: "野菜",       emoji: "\ud83e\udd2c", order: 1 },
  tofu_natto: { label: "豆腐・練り物", emoji: "\ud83e\udeb6", order: 2 },
  dairy_egg:  { label: "乳製品・卵",  emoji: "\ud83e\udd5a", order: 3 },
  dry_goods:  { label: "乾物・缶詰",  emoji: "\ud83e\udd6b", order: 4 },
  seasoning:  { label: "調味料",      emoji: "\ud83e\uddc2", order: 5 },
  frozen:     { label: "冷凍食品",    emoji: "\ud83e\uddca", order: 6 },
  other:      { label: "その他",      emoji: "\ud83d\udce6", order: 7 },
};

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff >= 0 && diff < 3 * 86400000; // 3日以内
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

export default function PantryList() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pantry");
      const json: ApiResponse<PantryItem[]> = await res.json();
      if (json.data) setItems(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/pantry/${id}`, { method: "DELETE" });
  }, []);

  const handleAdd = useCallback(
    async (item: { name: string; amount?: number; unit?: string; category: string; expiry_date?: string }) => {
      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      const json: ApiResponse<PantryItem> = await res.json();
      if (json.data) {
        setItems((prev) => [...prev, json.data!]);
      }
    },
    []
  );

  const grouped = useMemo(() => {
    const categories = new Map<string, PantryItem[]>();
    for (const item of items) {
      const cat = item.category || "other";
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(item);
    }
    return Array.from(categories.entries())
      .sort(([a], [b]) => (CATEGORY_CONFIG[a]?.order ?? 9) - (CATEGORY_CONFIG[b]?.order ?? 9))
      .map(([category, catItems]) => ({
        category,
        config: CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other,
        items: catItems,
      }));
  }, [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Refrigerator size={20} className="text-blue" />
          <h1 className="text-lg font-bold">冷蔵庫</h1>
        </div>
        <span className="text-xs text-muted">{items.length} アイテム</span>
      </div>

      {/* Warning: expiring items */}
      {items.some((i) => isExpiringSoon(i.expiry_date) || isExpired(i.expiry_date)) && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-orange/10 px-3 py-2 text-xs text-orange">
          <AlertTriangle size={14} />
          期限が近い or 切れた食材があります
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <Refrigerator size={32} className="text-muted" />
          <p className="text-sm text-muted">冷蔵庫は空です</p>
          <p className="text-xs text-muted">買い物リストのチェックで自動追加されます</p>
        </div>
      ) : (
        <div className="space-y-4 px-3">
          {grouped.map(({ category, config, items: catItems }) => (
            <section key={category}>
              <h2 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
                <span>{config.emoji}</span>
                {config.label}
                <span className="text-[10px] font-normal">({catItems.length})</span>
              </h2>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between rounded-lg bg-card px-3 py-2.5 ${
                      isExpired(item.expiry_date)
                        ? "border border-danger/30"
                        : isExpiringSoon(item.expiry_date)
                          ? "border border-orange/30"
                          : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {(isExpired(item.expiry_date) || isExpiringSoon(item.expiry_date)) && (
                          <AlertTriangle
                            size={12}
                            className={isExpired(item.expiry_date) ? "text-danger" : "text-orange"}
                          />
                        )}
                        <span className="text-sm">{item.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
                        {item.amount != null && (
                          <span>
                            {item.amount}
                            {item.unit}
                          </span>
                        )}
                        {item.expiry_date && (
                          <span className={isExpired(item.expiry_date) ? "text-danger" : ""}>
                            ~{item.expiry_date.slice(5).replace("-", "/")}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="ml-2 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add button */}
      <div className="mt-4 px-3">
        <PantryAddDialog onAdd={handleAdd} />
      </div>
    </div>
  );
}

function PantryAddDialog({
  onAdd,
}: {
  onAdd: (item: { name: string; amount?: number; unit?: string; category: string; expiry_date?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");
  const [expiryDate, setExpiryDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      amount: amount ? parseFloat(amount) : undefined,
      unit: unit || undefined,
      category,
      expiry_date: expiryDate || undefined,
    });
    setName("");
    setAmount("");
    setUnit("");
    setCategory("other");
    setExpiryDate("");
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
          食材を追加
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-bold">食材を追加</Dialog.Title>
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
              <input
                type="date"
                placeholder="期限"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                    category === key
                      ? "bg-accent text-background"
                      : "border border-border bg-background text-muted"
                  }`}
                >
                  {cfg.emoji} {cfg.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              追加
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
