"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ChefHat, Flame, Plus, Heart, Settings, ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import type { RecipeListItem, CookMethod } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";
import HotcookImportDialog from "./HotcookImportDialog";

const COOK_METHOD_LABELS: Record<CookMethod | "all", string> = {
  all: "すべて",
  hotcook: "ホットクック",
  stove: "コンロ",
  other: "その他",
};

export default function RecipeList() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cookMethodFilter, setCookMethodFilter] = useState<CookMethod | "all">("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (cookMethodFilter !== "all") params.set("cook_method", cookMethodFilter);
      if (favoriteOnly) params.set("is_favorite", "true");
      params.set("limit", "100");

      const res = await fetch(`/api/recipes?${params}`);
      const json: ApiResponse<RecipeListItem[]> = await res.json();
      if (json.data) setRecipes(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [query, cookMethodFilter, favoriteOnly]);

  useEffect(() => {
    const timer = setTimeout(fetchRecipes, 300);
    return () => clearTimeout(timer);
  }, [fetchRecipes]);

  return (
    <div className="bg-bg-grouped pb-6">
      {showImport && (
        <HotcookImportDialog
          onClose={() => {
            setShowImport(false);
            fetchRecipes();
          }}
        />
      )}

      {/* Large Title */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[34px] font-bold leading-[41px] text-label">レシピ</h1>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
              aria-label="設定"
            >
              <Settings size={20} strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
              aria-label="インポート"
            >
              <Download size={20} strokeWidth={1.5} />
            </button>
            <Link
              href="/recipes/new"
              className="flex h-9 w-9 items-center justify-center rounded-full text-blue active:bg-fill"
              aria-label="新規"
            >
              <Plus size={22} strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary" strokeWidth={2} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="レシピを検索"
            className="w-full rounded-[10px] bg-fill-tertiary py-2 pl-9 pr-4 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
          />
        </div>

        {/* Segmented filter */}
        <div className="mt-3 flex gap-1 rounded-[8px] bg-fill-tertiary p-1">
          {(Object.keys(COOK_METHOD_LABELS) as (CookMethod | "all")[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setCookMethodFilter(method)}
              className={`flex-1 rounded-[6px] py-1.5 text-[13px] font-semibold transition-all ${
                cookMethodFilter === method
                  ? "bg-bg-secondary text-label shadow-sm"
                  : "text-label-secondary"
              }`}
            >
              {COOK_METHOD_LABELS[method]}
            </button>
          ))}
        </div>

        {/* Favorite toggle */}
        <button
          type="button"
          onClick={() => setFavoriteOnly(!favoriteOnly)}
          className={`mt-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
            favoriteOnly
              ? "bg-red/10 text-red"
              : "bg-fill-tertiary text-label-secondary"
          }`}
        >
          <Heart size={12} fill={favoriteOnly ? "currentColor" : "none"} strokeWidth={2} />
          殿堂入りのみ
        </button>
      </div>

      {/* List */}
      <div className="mt-4 px-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
          </div>
        ) : recipes.length === 0 ? (
          <div className="py-16 text-center text-[15px] text-label-secondary">
            {query ? "該当するレシピがありません" : "レシピがまだありません"}
          </div>
        ) : (
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {recipes.map((recipe) => (
              <Link
                key={recipe.id}
                href={`/recipes/${recipe.id}`}
                className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 active:bg-fill-tertiary transition-colors"
              >
                {recipe.image_url ? (
                  <img
                    src={recipe.image_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-[8px] object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary">
                    <ChefHat size={20} className="text-label-tertiary" strokeWidth={1.5} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    {recipe.is_favorite && (
                      <Heart size={11} className="shrink-0 fill-red text-red" />
                    )}
                    <span className="truncate text-[17px] text-label">{recipe.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-label-tertiary">
                    {recipe.cook_method === "hotcook" && (
                      <span className="flex items-center gap-0.5">
                        <ChefHat size={10} strokeWidth={1.5} />
                        ホットクック
                      </span>
                    )}
                    {recipe.cook_time_min != null && (
                      <span className="flex items-center gap-0.5">
                        <Flame size={10} strokeWidth={1.5} />
                        {recipe.cook_time_min}分
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="shrink-0 text-label-tertiary" strokeWidth={2} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
