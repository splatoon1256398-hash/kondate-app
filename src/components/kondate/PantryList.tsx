"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Refrigerator, Plus, Trash2, X, AlertTriangle, Pin } from "lucide-react";
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
  return diff >= 0 && diff < 3 * 86400000;
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

  const toggleStaple = useCallback(async (id: string, current: boolean) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, is_staple: !current } : i))
    );
    await fetch(`/api/pantry/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_staple: !current }),
    });
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

  const staples = useMemo(() => items.filter((i) => i.is_staple), [items]);
  const regularItems = useMemo(() => items.filter((i) => !i.is_staple), [items]);

  const grouped = useMemo(() => {
    const categories = new Map<string, PantryItem[]>();
    for (const item of regularItems) {
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
  }, [regularItems]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="bg-bg-grouped pb-6">
      {/* Large Title */}
      <div className="px-4 pt-3 pb-2">
        <h1 className="text-[34px] font-bold leading-[41px] text-label">在庫</h1>
        <p className="text-[15px] text-label-secondary">{items.length} アイテム</p>
      </div>

      {/* Warning */}
      {items.some((i) => isExpiringSoon(i.expiry_date) || isExpired(i.expiry_date)) && (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-[10px] bg-orange/10 px-4 py-3 text-[13px] text-orange">
          <AlertTriangle size={14} strokeWidth={1.5} />
          期限が近い・切れた食材があります
        </div>
      )}

      {/* Staples */}
      {staples.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-1.5 flex items-center gap-1.5 px-4 pl-4 text-[13px] font-semibold uppercase tracking-wide text-blue">
            <Pin size={11} strokeWidth={2} />
            常備品 ({staples.length})
          </h2>
          <div className="mx-4 rounded-[10px] bg-bg-grouped-secondary p-3">
            <div className="flex flex-wrap gap-1.5">
              {staples.map((item) => (
                <span
                  key={item.id}
                  className="flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-[13px] font-medium text-blue"
                >
                  {item.name}
                  <button
                    type="button"
                    onClick={() => toggleStaple(item.id, true)}
                    className="ml-0.5 text-blue/60"
                    aria-label="常備品から外す"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {regularItems.length === 0 && staples.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill">
            <Refrigerator size={28} className="text-blue" strokeWidth={1.5} />
          </div>
          <p className="text-[17px] text-label">在庫は空です</p>
          <p className="text-[13px] text-label-secondary">買い物リストのチェックで自動追加されます</p>
        </div>
      ) : (
        <div className="px-4">
          {grouped.map(({ category, config, items: catItems }) => (
            <section key={category} className="mt-5">
              <h2 className="mb-1.5 flex items-center gap-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
                <span>{config.emoji}</span>
                {config.label}
                <span className="text-[11px] font-normal">({catItems.length})</span>
              </h2>
              <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-h-[44px] items-center px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {(isExpired(item.expiry_date) || isExpiringSoon(item.expiry_date)) && (
                          <AlertTriangle
                            size={12}
                            className={isExpired(item.expiry_date) ? "text-red" : "text-orange"}
                            strokeWidth={2}
                          />
                        )}
                        <span className="text-[17px] text-label">{item.name}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-label-tertiary">
                        {item.amount != null && (
                          <span>
                            {item.amount}
                            {item.unit}
                          </span>
                        )}
                        {item.expiry_date && (
                          <span className={isExpired(item.expiry_date) ? "text-red" : ""}>
                            ~{item.expiry_date.slice(5).replace("-", "/")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="ml-2 flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        onClick={() => toggleStaple(item.id, item.is_staple)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          item.is_staple ? "text-blue" : "text-label-tertiary"
                        } active:bg-fill`}
                        aria-label="常備品にする"
                      >
                        <Pin size={14} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-red active:bg-fill"
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add */}
      <div className="mt-5 px-4">
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
          className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-bg-grouped-secondary py-3 text-[15px] font-medium text-blue active:bg-fill-tertiary"
        >
          <Plus size={16} strokeWidth={2} />
          食材を追加
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-gray3" />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <Dialog.Close className="text-[17px] text-blue active:opacity-60">
              キャンセル
            </Dialog.Close>
            <Dialog.Title className="text-[17px] font-semibold text-label">食材を追加</Dialog.Title>
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
              <div className="flex min-h-[44px] items-center px-4">
                <span className="w-20 shrink-0 text-[17px] text-label">期限</span>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="flex-1 bg-transparent py-3 text-[17px] text-label-secondary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <h3 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
                カテゴリ
              </h3>
              <div className="rounded-[10px] bg-bg-grouped-secondary p-3">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        category === key
                          ? "bg-blue text-white"
                          : "bg-fill text-label"
                      }`}
                    >
                      {cfg.emoji} {cfg.label}
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
