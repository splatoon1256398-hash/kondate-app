"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, ChefHat, Flame, Plus, Filter, Download, Heart, Settings } from "lucide-react";
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

const SOURCE_LABELS: Record<string, string> = {
  ai: "AI",
  manual: "手動",
  imported: "インポート",
};

export default function RecipeList() {
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cookMethodFilter, setCookMethodFilter] = useState<CookMethod | "all">("all");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
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
    <div className="pb-6">
      {/* Import dialog */}
      {showImport && (
        <HotcookImportDialog
          onClose={() => {
            setShowImport(false);
            fetchRecipes();
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-lg font-bold">レシピ</h1>
        <div className="flex gap-2">
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-foreground"
          >
            <Settings size={14} />
          </Link>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1 rounded-full border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
          >
            <Download size={14} />
            インポート
          </button>
          <Link
            href="/recipes/new"
            className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            <Plus size={14} />
            新規
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="px-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="レシピを検索..."
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setFavoriteOnly(!favoriteOnly)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
              favoriteOnly
                ? "border-danger bg-danger/10 text-danger"
                : "border-border text-muted hover:text-foreground"
            }`}
            aria-label="殿堂入りのみ"
          >
            <Heart size={16} fill={favoriteOnly ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
              cookMethodFilter !== "all"
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            <Filter size={16} />
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-2 flex gap-1.5">
            {(Object.keys(COOK_METHOD_LABELS) as (CookMethod | "all")[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setCookMethodFilter(method)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  cookMethodFilter === method
                    ? "bg-accent text-background"
                    : "bg-card text-muted hover:text-foreground"
                }`}
              >
                {COOK_METHOD_LABELS[method]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="mt-3 space-y-1.5 px-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : recipes.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            {query ? "該当するレシピがありません" : "レシピがまだありません"}
          </div>
        ) : (
          recipes.map((recipe) => (
            <Link
              key={recipe.id}
              href={`/recipes/${recipe.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent/30"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{recipe.title}</span>
                  {recipe.is_favorite && (
                    <Heart size={12} className="shrink-0 fill-danger text-danger" />
                  )}
                  {recipe.cook_method === "hotcook" && (
                    <ChefHat size={14} className="shrink-0 text-accent" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                  {recipe.cook_method === "hotcook" && recipe.hotcook_menu_number && (
                    <span>No.{recipe.hotcook_menu_number}</span>
                  )}
                  {recipe.cook_time_min != null && (
                    <span className="flex items-center gap-0.5">
                      <Flame size={10} />
                      {recipe.cook_time_min}分
                    </span>
                  )}
                  <span className="rounded-full bg-card px-1.5 py-0.5 text-[9px] border border-border">
                    {SOURCE_LABELS[recipe.source] ?? recipe.source}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
