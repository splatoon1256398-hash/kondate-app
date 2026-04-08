"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
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

  // Supabase Realtime subscription
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
                // 既に存在する場合は追加しない（自分の操作による重複防止）
                if (prev.items.some((item) => item.id === inserted.id)) {
                  return prev;
                }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe only when list ID changes
  }, [list?.id]);

  const handleToggle = useCallback(
    async (item: ShoppingItemResponse) => {
      if (!list) return;

      const newChecked = !item.is_checked;

      // Optimistic update
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

  // Group items by category, unchecked first
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <ShoppingCart size={32} className="text-muted" />
        <p className="text-sm text-muted">
          献立を確定すると買い物リストが生成されます
        </p>
        <Link
          href="/menu"
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          献立を見る
        </Link>
      </div>
    );
  }

  const totalItems = list.items.length;
  const checkedItems = list.items.filter((i) => i.is_checked).length;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">買い物リスト</h1>
            <p className="text-xs text-muted">
              {shortDate(list.week_start_date)} の週
            </p>
          </div>
          {checkedItems > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("チェック済みアイテムを全て削除しますか？")) return;
                const checkedIds = list.items.filter((i) => i.is_checked).map((i) => i.id);
                setList((prev) => prev ? { ...prev, items: prev.items.filter((i) => !i.is_checked) } : prev);
                for (const itemId of checkedIds) {
                  await fetch(`/api/shopping-lists/${list.id}/items/${itemId}`, { method: "DELETE" });
                }
              }}
              className="flex items-center gap-1 rounded-lg bg-card px-2.5 py-1.5 text-[10px] text-muted transition-colors active:text-danger"
            >
              <Trash2 size={12} />
              済を削除
            </button>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-green transition-all"
              style={{ width: totalItems > 0 ? `${(checkedItems / totalItems) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-xs text-muted">
            {checkedItems}/{totalItems}
          </span>
        </div>
      </div>

      {/* Category groups */}
      <div className="space-y-4 px-3">
        {grouped.map(({ category, config, items }) => (
          <section key={category}>
            <h2 className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
              <span>{config.emoji}</span>
              {config.label}
              <span className="text-[10px] font-normal">({items.length})</span>
            </h2>
            <div className="space-y-1">
              {items.map((item) => (
                <ShoppingItem key={item.id} item={item} onToggle={handleToggle} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Add button */}
      <div className="mt-4 px-3">
        <ShoppingAddDialog onAdd={handleAdd} />
      </div>

      {/* Complete button - show when most items are checked */}
      {totalItems > 0 && checkedItems >= Math.ceil(totalItems * 0.5) && (
        <div className="mt-3 px-3">
          <ShoppingComplete
            shoppingListId={list.id}
            onComplete={fetchList}
          />
        </div>
      )}
    </div>
  );
}
