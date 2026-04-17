"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Refrigerator,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Pin,
  Sparkles,
  Search,
  ChefHat,
  Heart,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { PantryItem } from "@/types/pantry";
import type { RecipeListItem } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
import { daysLeft, residualLabel } from "@/lib/utils/pantry-freshness";

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

/**
 * 2層モデル:
 *   - week: 今週使い切る手持ち食材（is_staple=false && category !== "seasoning"）
 *   - stock: 常備品・調味料（is_staple=true || category === "seasoning"）
 *
 * AI提案の「残り食材」は week だけを読む（AiSuggestionForm で既に同等の絞り込み）。
 * 常備品・調味料は「常にある前提」のため、献立提案の制約には入らない。
 */
type PantryTab = "week" | "stock";

function isWeekItem(item: PantryItem): boolean {
  return !item.is_staple && (item.category || "other") !== "seasoning";
}

export default function PantryList() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PantryTab>("week");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [lookupIngredient, setLookupIngredient] = useState<string | null>(null);

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

  /** 「今週の手持ち」: 常備品フラグなし & 調味料以外 */
  const weekItems = useMemo(() => items.filter(isWeekItem), [items]);

  /** 「常備・調味料」タブに出す非常備品の調味料（is_staple=false だが調味料カテゴリ） */
  const stockSeasonings = useMemo(
    () =>
      items.filter(
        (i) => !i.is_staple && (i.category || "other") === "seasoning"
      ),
    [items]
  );

  const tabItems = tab === "week" ? weekItems : stockSeasonings;
  const weekCount = weekItems.length;
  const stockCount = staples.length + stockSeasonings.length;

  const grouped = useMemo(() => {
    const categories = new Map<string, PantryItem[]>();
    for (const item of tabItems) {
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
  }, [tabItems]);

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

      {/* Segmented tab (今週の手持ち / 常備・調味料) */}
      <div className="px-4 pb-3 pt-1">
        <div className="flex gap-1 rounded-[9px] bg-fill-tertiary p-[3px]">
          {(
            [
              { key: "week", label: "今週の手持ち", count: weekCount },
              { key: "stock", label: "常備・調味料", count: stockCount },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[7px] py-1.5 text-[13px] font-semibold transition-colors ${
                tab === key
                  ? "bg-bg-secondary text-label shadow-sm"
                  : "text-label-secondary"
              }`}
            >
              {label}
              <span className="text-[11px] text-label-tertiary">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Weekly reset button (week タブのみ) */}
      {tab === "week" && weekItems.length > 0 && (
        <div className="mb-3 px-4">
          <button
            type="button"
            onClick={() => setShowResetDialog(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-separator bg-bg-grouped-secondary py-2 text-[13px] font-medium text-label-secondary active:bg-fill"
          >
            <Sparkles size={12} strokeWidth={2} />
            今週の手持ちを整理
          </button>
        </div>
      )}

      {/* Warning */}
      {items.some((i) => isExpiringSoon(i.expiry_date) || isExpired(i.expiry_date)) && (
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-[10px] bg-orange/10 px-4 py-3 text-[13px] text-orange">
          <AlertTriangle size={14} strokeWidth={1.5} />
          期限が近い・切れた食材があります
        </div>
      )}

      {/* Staples (stock タブのみ表示 — week タブは「今週使い切る」に集中) */}
      {tab === "stock" && staples.length > 0 && (
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
                  <button
                    type="button"
                    onClick={() => setLookupIngredient(item.name)}
                    className="active:opacity-60"
                  >
                    {item.name}
                  </button>
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

      {tabItems.length === 0 && (tab === "week" || staples.length === 0) ? (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill">
            <Refrigerator size={28} className="text-blue" strokeWidth={1.5} />
          </div>
          <p className="text-[17px] text-label">
            {tab === "week" ? "今週の手持ちはありません" : "常備品は登録されていません"}
          </p>
          <p className="text-[13px] text-label-secondary">
            {tab === "week"
              ? "買い物リストのチェックで自動追加されます"
              : "よく使う食材を常備品に登録すると、AI提案で常にある前提として扱われます"}
          </p>
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
                    <button
                      type="button"
                      onClick={() => setLookupIngredient(item.name)}
                      className="flex min-w-0 flex-1 flex-col text-left active:opacity-60"
                    >
                      <div className="flex items-center gap-1.5">
                        {(isExpired(item.expiry_date) || isExpiringSoon(item.expiry_date)) && (
                          <AlertTriangle
                            size={12}
                            className={isExpired(item.expiry_date) ? "text-red" : "text-orange"}
                            strokeWidth={2}
                          />
                        )}
                        <span className="text-[17px] text-label">{item.name}</span>
                        <Search
                          size={11}
                          className="text-label-tertiary"
                          strokeWidth={2}
                          aria-label="この食材のレシピを探す"
                        />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[12px] text-label-tertiary">
                        {item.amount != null && (
                          <span>
                            {item.amount}
                            {item.unit}
                          </span>
                        )}
                        {item.expiry_date && (
                          <>
                            <span className={isExpired(item.expiry_date) ? "text-red" : ""}>
                              ~{item.expiry_date.slice(5).replace("-", "/")}
                            </span>
                            {(() => {
                              const d = daysLeft(item.expiry_date);
                              if (d == null) return null;
                              const label = residualLabel(item.expiry_date);
                              const color =
                                d < 0
                                  ? "text-red font-semibold"
                                  : d <= 1
                                  ? "text-red font-semibold"
                                  : d <= 3
                                  ? "text-orange font-semibold"
                                  : "text-label-tertiary";
                              return <span className={color}>{label}</span>;
                            })()}
                          </>
                        )}
                      </div>
                    </button>
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

      {/* Ingredient → recipes lookup dialog */}
      <IngredientRecipesDialog
        ingredient={lookupIngredient}
        onClose={() => setLookupIngredient(null)}
      />

      {/* Weekly reset dialog */}
      <WeeklyResetDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        items={weekItems}
        onDelete={async (ids) => {
          setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
          await Promise.all(
            ids.map((id) =>
              fetch(`/api/pantry/${id}`, { method: "DELETE" })
            )
          );
        }}
      />
    </div>
  );
}

function IngredientRecipesDialog({
  ingredient,
  onClose,
}: {
  ingredient: string | null;
  onClose: () => void;
}) {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = ingredient != null;

  useEffect(() => {
    if (!ingredient) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecipes([]);
    (async () => {
      try {
        const res = await fetch(
          `/api/recipes/by-ingredient?name=${encodeURIComponent(ingredient)}&limit=50`
        );
        const json: ApiResponse<RecipeListItem[]> = await res.json();
        if (cancelled) return;
        if (json.error || !json.data) {
          setError(json.error || "取得に失敗しました");
        } else {
          setRecipes(json.data);
        }
      } catch {
        if (!cancelled) setError("通信エラー");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ingredient]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-h-[85vh] max-w-lg overflow-hidden rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
          <div className="flex justify-center pt-2 pb-1">
            <div className="h-1 w-9 rounded-full bg-gray3" />
          </div>

          <div className="flex items-center justify-between px-4 py-2">
            <Dialog.Close className="text-[17px] text-blue active:opacity-60">
              閉じる
            </Dialog.Close>
            <Dialog.Title className="truncate px-3 text-[17px] font-semibold text-label">
              「{ingredient}」を使うレシピ
            </Dialog.Title>
            <span className="w-10" />
          </div>

          <div className="px-4 pb-4 pt-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue border-t-transparent" />
              </div>
            ) : error ? (
              <div className="py-10 text-center text-[13px] text-red">{error}</div>
            ) : recipes.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-label-tertiary">
                このアプリ内には「{ingredient}」を使うレシピがまだありません
              </div>
            ) : (
              <>
                <p className="mb-2 px-1 text-[12px] text-label-tertiary">
                  {recipes.length}件ヒット
                </p>
                <div className="cell-separator max-h-[60vh] overflow-y-auto rounded-[10px] bg-bg-grouped-secondary">
                  {recipes.map((r) => (
                    <Link
                      key={r.id}
                      href={`/menu/${r.id}`}
                      onClick={onClose}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-fill"
                    >
                      {r.is_favorite && (
                        <Heart size={12} className="shrink-0 fill-red text-red" />
                      )}
                      <span className="flex-1 truncate text-[17px] text-label">
                        {r.title}
                      </span>
                      {r.cook_time_min != null && (
                        <span className="shrink-0 text-[12px] text-label-tertiary">
                          {r.cook_time_min}分
                        </span>
                      )}
                      {r.cook_method === "hotcook" && (
                        <ChefHat
                          size={12}
                          className="shrink-0 text-label-tertiary"
                          strokeWidth={1.5}
                        />
                      )}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WeeklyResetDialog({
  open,
  onOpenChange,
  items,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: PantryItem[];
  onDelete: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialog を開くたびに選択をリセット
  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const handleApply = async () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    await onDelete(ids);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
            <Dialog.Title className="text-[17px] font-semibold text-label">
              手持ちを整理
            </Dialog.Title>
            <button
              type="button"
              onClick={handleApply}
              disabled={selected.size === 0}
              className="text-[17px] font-semibold text-red active:opacity-60 disabled:opacity-30"
            >
              削除 ({selected.size})
            </button>
          </div>

          <p className="px-4 pb-3 text-[13px] text-label-secondary">
            使い切った・もう無い食材にチェックを入れて削除します。
          </p>

          <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
            <button
              type="button"
              onClick={toggleAll}
              className="mb-2 text-[13px] font-medium text-blue active:opacity-60"
            >
              {allSelected ? "すべて解除" : "すべて選択"}
            </button>
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              {items.map((item) => {
                const checked = selected.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-fill-tertiary"
                  >
                    <span
                      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                        checked ? "border-red bg-red text-white" : "border-gray3"
                      }`}
                    >
                      {checked && <X size={14} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 text-[17px] text-label">{item.name}</span>
                    {item.amount != null && (
                      <span className="text-[13px] text-label-tertiary">
                        {item.amount}
                        {item.unit || ""}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
