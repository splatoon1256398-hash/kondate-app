"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, Trash2, Sparkles } from "lucide-react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { shortDate } from "@/lib/utils/date";
import type { ApiResponse } from "@/types/common";
import type {
  ShoppingListResponse,
  ShoppingItemResponse,
  ItemCategory,
} from "@/types/shopping-list";
import ShoppingItem from "./ShoppingItem";
import ShoppingAddDialog from "./ShoppingAddDialog";
import ShoppingComplete from "./ShoppingComplete";

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; order: number }> = {
  meat_fish:  { label: "肉・魚コーナー", emoji: "\ud83e\udd69", order: 0 },
  vegetable:  { label: "野菜・果物",     emoji: "\ud83e\udd2c", order: 1 },
  tofu_natto: { label: "豆腐・練り物",   emoji: "\ud83e\udeb6", order: 2 },
  dairy_egg:  { label: "乳製品・卵",     emoji: "\ud83e\udd5a", order: 3 },
  dry_goods:  { label: "乾物・缶詰",     emoji: "\ud83e\udd6b", order: 4 },
  seasoning:  { label: "調味料",         emoji: "\ud83e\uddc2", order: 5 },
  frozen:     { label: "冷凍食品",       emoji: "\ud83e\uddca", order: 6 },
  other:      { label: "その他",         emoji: "\ud83d\udce6", order: 7 },
};

export default function ShoppingList() {
  const [list, setList] = useState<ShoppingListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopping-lists?status=active");
      const json: ApiResponse<ShoppingListResponse[]> = await res.json();
      setList(json.data && json.data.length > 0 ? json.data[0] : null);
    } catch {
      setList(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Realtime subscription
  useEffect(() => {
    if (!list) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`shopping-items-${list.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
          filter: `shopping_list_id=eq.${list.id}`,
        },
        (payload) => {
          setList((prev) => {
            if (!prev) return prev;
            switch (payload.eventType) {
              case "UPDATE": {
                const updated = payload.new as ShoppingItemResponse;
                return {
                  ...prev,
                  items: prev.items.map((item) =>
                    item.id === updated.id ? updated : item
                  ),
                };
              }
              case "INSERT": {
                const inserted = payload.new as ShoppingItemResponse;
                if (prev.items.some((item) => item.id === inserted.id)) return prev;
                return { ...prev, items: [...prev.items, inserted] };
              }
              case "DELETE": {
                const deletedId = payload.old.id as string;
                return {
                  ...prev,
                  items: prev.items.filter((item) => item.id !== deletedId),
                };
              }
              default:
                return prev;
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list?.id]);

  const handleToggle = useCallback(
    async (item: ShoppingItemResponse) => {
      if (!list) return;
      const newChecked = !item.is_checked;
      setList((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.id === item.id
              ? { ...i, is_checked: newChecked, checked_by: newChecked ? "れん" : null }
              : i
          ),
        };
      });
      await fetch(`/api/shopping-lists/${list.id}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_checked: newChecked,
          checked_by: newChecked ? "れん" : null,
        }),
      });
    },
    [list]
  );

  const handleAdd = useCallback(
    async (input: { name: string; amount?: number; unit?: string; category: ItemCategory }) => {
      if (!list) return;
      const res = await fetch(`/api/shopping-lists/${list.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json: ApiResponse<ShoppingItemResponse> = await res.json();
      if (json.data) {
        setList((prev) => {
          if (!prev) return prev;
          if (prev.items.some((i) => i.id === json.data!.id)) return prev;
          return { ...prev, items: [...prev.items, json.data!] };
        });
      }
    },
    [list]
  );

  const grouped = useMemo(() => {
    if (!list) return [];
    const categories = new Map<string, ShoppingItemResponse[]>();
    for (const item of list.items) {
      const cat = item.category || "other";
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(item);
    }
    return Array.from(categories.entries())
      .sort(([a], [b]) => (CATEGORY_CONFIG[a]?.order ?? 9) - (CATEGORY_CONFIG[b]?.order ?? 9))
      .map(([category, items]) => {
        const unchecked = items.filter((i) => !i.is_checked);
        const checked = items.filter((i) => i.is_checked);
        return {
          category,
          config: CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other,
          items: [...unchecked, ...checked],
        };
      });
  }, [list]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="bg-bg-grouped">
        <div className="px-4 pt-3 pb-2">
          <h1 className="text-[34px] font-bold leading-[41px] text-label">買い物</h1>
        </div>
        <div className="flex flex-col items-center justify-center gap-5 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill">
            <ShoppingCart size={28} className="text-blue" strokeWidth={1.5} />
          </div>
          <p className="text-[17px] text-label-secondary">
            献立を確定すると買い物リストが生成されます
          </p>
          <Link
            href="/menu"
            className="flex h-[50px] items-center gap-2 rounded-[12px] bg-blue px-6 text-[17px] font-semibold text-white active:opacity-80"
          >
            <Sparkles size={18} strokeWidth={2} />
            献立を見る
          </Link>
        </div>
      </div>
    );
  }

  const totalItems = list.items.length;
  const checkedItems = list.items.filter((i) => i.is_checked).length;
  const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;

  return (
    <div className="bg-bg-grouped pb-4">
      {/* Large Title */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] font-bold leading-[41px] text-label">買い物</h1>
          {checkedItems > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("チェック済みアイテムを削除しますか？")) return;
                const checkedIds = list.items.filter((i) => i.is_checked).map((i) => i.id);
                setList((prev) => prev ? { ...prev, items: prev.items.filter((i) => !i.is_checked) } : prev);
                for (const itemId of checkedIds) {
                  await fetch(`/api/shopping-lists/${list.id}/items/${itemId}`, { method: "DELETE" });
                }
              }}
              className="flex items-center gap-1 text-[15px] text-red active:opacity-60"
            >
              <Trash2 size={15} strokeWidth={2} />
              済を削除
            </button>
          )}
        </div>
        <p className="text-[15px] text-label-secondary">
          {shortDate(list.week_start_date)} の週 · {checkedItems}/{totalItems}
        </p>
        {/* Progress bar */}
        <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-fill-tertiary">
          <div
            className="h-full rounded-full bg-green transition-all ease-ios duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Grouped sections */}
      <div className="px-4">
        {grouped.map(({ category, config, items }) => (
          <section key={category} className="mt-5">
            <h2 className="mb-1.5 flex items-center gap-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
              <span>{config.emoji}</span>
              {config.label}
              <span className="text-[11px] font-normal">({items.length})</span>
            </h2>
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              {items.map((item) => (
                <ShoppingItem key={item.id} item={item} onToggle={handleToggle} />
              ))}
            </div>
          </section>
        ))}

        {/* Add */}
        <div className="mt-5">
          <ShoppingAddDialog onAdd={handleAdd} />
        </div>

        {/* Complete */}
        {totalItems > 0 && checkedItems >= Math.ceil(totalItems * 0.5) && (
          <div className="mt-3">
            <ShoppingComplete shoppingListId={list.id} onComplete={fetchList} />
          </div>
        )}
      </div>
    </div>
  );
}
