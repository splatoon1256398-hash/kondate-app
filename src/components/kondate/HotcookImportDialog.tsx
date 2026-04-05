"use client";

import { useState } from "react";
import { Download, Loader2, CheckCircle2, X, ExternalLink } from "lucide-react";
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
  const [model, setModel] = useState("KN-HW24G");
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-background p-5 sm:rounded-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">ホットクックレシピをインポート</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Help text */}
        <p className="mb-3 text-xs text-muted">
          COCORO KITCHEN のレシピIDまたはURLを入力してください。
        </p>
        <a
          href="https://cocoroplus.jp.sharp/kitchen/recipe"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 flex items-center gap-1 text-xs text-accent hover:opacity-80"
        >
          <ExternalLink size={12} />
          COCORO KITCHEN でレシピを探す
        </a>

        {/* Input */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">レシピID / URL</label>
            <input
              type="text"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              placeholder="例: R4325 または URL"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">機種名</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
            >
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
          <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-3 rounded-lg bg-green/10 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-green">
              <CheckCircle2 size={14} />
              {result.already_exists ? "既にインポート済みです" : "インポート完了"}
            </div>
            {result.title && (
              <p className="mt-1 text-xs text-muted">{result.title}</p>
            )}
            <button
              type="button"
              onClick={() => router.push(`/recipes/${result.id}`)}
              className="mt-2 text-xs font-medium text-accent hover:opacity-80"
            >
              レシピを見る →
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleImport}
            disabled={loading || !recipeId.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            インポート
          </button>
        </div>
      </div>
    </div>
  );
}

/** Extract recipe ID from URL or raw ID */
function extractRecipeId(input: string): string | null {
  if (!input) return null;

  // Direct ID like "R4325"
  if (/^[A-Za-z]?\d+$/.test(input)) return input;

  // URL pattern: .../recipe/detail/R4325 or similar
  const urlMatch = input.match(/recipe[/](?:detail[/])?([A-Za-z]?\d+)/i);
  if (urlMatch) return urlMatch[1];

  // Just numbers
  const numMatch = input.match(/\d+/);
  if (numMatch) return numMatch[0];

  return input;
}
