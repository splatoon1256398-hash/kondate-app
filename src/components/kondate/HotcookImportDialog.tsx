"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ApiResponse } from "@/types/common";

type ImportResult = {
  id: string;
  already_exists: boolean;
  title?: string;
  ingredients_count?: number;
  steps_count?: number;
};

type Props = {
  onClose: () => void;
};

export default function HotcookImportDialog({ onClose }: Props) {
  const router = useRouter();
  const [recipeId, setRecipeId] = useState("");
  const [model, setModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hotcook_model") || "KN-HW24H";
    }
    return "KN-HW24H";
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const id = extractRecipeId(recipeId.trim());
    if (!id) {
      setError("レシピIDまたはURLを入力してください");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/hotcook-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: id, model }),
      });
      const json: ApiResponse<ImportResult> = await res.json();
      if (json.error) {
        setError(json.error);
      } else if (json.data) {
        setResult(json.data);
      }
    } catch {
      setError("インポートに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-lg rounded-t-[14px] bg-bg-secondary pb-safe shadow-2xl">
        {/* Grab bar */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-9 rounded-full bg-gray3" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[17px] text-blue active:opacity-60"
          >
            キャンセル
          </button>
          <h2 className="text-[17px] font-semibold text-label">レシピをインポート</h2>
          <button
            type="button"
            onClick={handleImport}
            disabled={loading || !recipeId.trim()}
            className="text-[17px] font-semibold text-blue active:opacity-60 disabled:opacity-30"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : "実行"}
          </button>
        </div>

        <div className="space-y-5 px-4 pb-6 pt-3">
          {/* Help link */}
          <a
            href="https://cocoroplus.jp.sharp/kitchen/recipe"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[13px] text-blue active:opacity-60"
          >
            <ExternalLink size={12} strokeWidth={2} />
            COCORO KITCHEN でレシピを探す
          </a>

          {/* Form */}
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            <div className="flex min-h-[44px] items-center px-4">
              <span className="w-24 shrink-0 text-[15px] text-label">レシピID</span>
              <input
                type="text"
                value={recipeId}
                onChange={(e) => setRecipeId(e.target.value)}
                placeholder="例: R4325"
                className="flex-1 bg-transparent py-3 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
              />
            </div>
            <div className="flex min-h-[44px] items-center px-4">
              <span className="w-24 shrink-0 text-[15px] text-label">機種</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex-1 bg-transparent py-3 text-[15px] text-label focus:outline-none"
              >
                <option value="KN-HW24H">KN-HW24H (2.4L)</option>
                <option value="KN-HW16H">KN-HW16H (1.6L)</option>
                <option value="KN-HW24G">KN-HW24G (2.4L)</option>
                <option value="KN-HW16G">KN-HW16G (1.6L)</option>
                <option value="KN-HW24F">KN-HW24F (2.4L)</option>
                <option value="KN-HW16F">KN-HW16F (1.6L)</option>
                <option value="KN-HW24E">KN-HW24E (2.4L)</option>
                <option value="KN-HW16E">KN-HW16E (1.6L)</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-[10px] bg-red/10 px-3 py-2.5 text-[13px] text-red">{error}</div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-[10px] bg-green/10 px-3 py-3">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-green">
                <CheckCircle2 size={14} strokeWidth={2} />
                {result.already_exists ? "既にインポート済みです" : "インポート完了"}
              </div>
              {result.title && <p className="mt-1 text-[13px] text-label-secondary">{result.title}</p>}
              <button
                type="button"
                onClick={() => router.push(`/recipes/${result.id}`)}
                className="mt-2 text-[13px] font-semibold text-blue active:opacity-60"
              >
                レシピを見る →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function extractRecipeId(input: string): string | null {
  if (!input) return null;
  if (/^[A-Za-z]?\d+$/.test(input)) return input;
  const urlMatch = input.match(/recipe[/](?:detail[/])?([A-Za-z]?\d+)/i);
  if (urlMatch) return urlMatch[1];
  const numMatch = input.match(/\d+/);
  if (numMatch) return numMatch[0];
  return input;
}
