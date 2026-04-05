"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Save, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { RecipeDetail, CookMethod } from "@/types/recipe";
import type { ApiResponse } from "@/types/common";

type IngredientRow = { name: string; amount: string; unit: string };
type StepRow = { instruction: string; tip: string };

type Props = {
  recipeId?: string; // undefined = new recipe
};

const COOK_METHODS: { value: CookMethod; label: string }[] = [
  { value: "hotcook", label: "ホットクック" },
  { value: "stove", label: "コンロ" },
  { value: "other", label: "その他" },
];

export default function RecipeEditForm({ recipeId }: Props) {
  const router = useRouter();
  const isNew = !recipeId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servingsBase, setServingsBase] = useState(2);
  const [cookMethod, setCookMethod] = useState<CookMethod>("hotcook");
  const [hotcookMenuNumber, setHotcookMenuNumber] = useState("");
  const [hotcookUnit, setHotcookUnit] = useState("");
  const [prepTimeMin, setPrepTimeMin] = useState("");
  const [cookTimeMin, setCookTimeMin] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { name: "", amount: "", unit: "" },
  ]);
  const [steps, setSteps] = useState<StepRow[]>([{ instruction: "", tip: "" }]);

  // Load existing recipe
  useEffect(() => {
    if (isNew) return;
    async function load() {
      try {
        const res = await fetch(`/api/recipes/${recipeId}`);
        const json: ApiResponse<RecipeDetail> = await res.json();
        if (json.error || !json.data) {
          setError(json.error || "レシピが見つかりません");
          return;
        }
        const r = json.data;
        setTitle(r.title);
        setDescription(r.description || "");
        setServingsBase(r.servings_base);
        setCookMethod(r.cook_method);
        setHotcookMenuNumber(r.hotcook_menu_number || "");
        setHotcookUnit(r.hotcook_unit || "");
        setPrepTimeMin(r.prep_time_min?.toString() || "");
        setCookTimeMin(r.cook_time_min?.toString() || "");
        setIngredients(
          r.ingredients.length > 0
            ? r.ingredients.map((i) => ({
                name: i.name,
                amount: i.amount.toString(),
                unit: i.unit,
              }))
            : [{ name: "", amount: "", unit: "" }]
        );
        setSteps(
          r.steps.length > 0
            ? r.steps.map((s) => ({ instruction: s.instruction, tip: s.tip || "" }))
            : [{ instruction: "", tip: "" }]
        );
      } catch {
        setError("レシピの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [recipeId, isNew]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }

    setSaving(true);
    setError(null);

    const filteredIngredients = ingredients
      .filter((i) => i.name.trim())
      .map((i, idx) => ({
        name: i.name.trim(),
        amount: parseFloat(i.amount) || 0,
        unit: i.unit.trim() || "適量",
        sort_order: idx + 1,
      }));

    const filteredSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s, idx) => ({
        step_number: idx + 1,
        instruction: s.instruction.trim(),
        tip: s.tip.trim() || undefined,
      }));

    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      servings_base: servingsBase,
      cook_method: cookMethod,
      hotcook_menu_number: hotcookMenuNumber.trim() || undefined,
      hotcook_unit: hotcookUnit.trim() || undefined,
      prep_time_min: prepTimeMin ? parseInt(prepTimeMin) : undefined,
      cook_time_min: cookTimeMin ? parseInt(cookTimeMin) : undefined,
      source: isNew ? ("manual" as const) : undefined,
      ingredients: filteredIngredients,
      steps: filteredSteps,
    };

    try {
      const url = isNew ? "/api/recipes" : `/api/recipes/${recipeId}`;
      const method = isNew ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: ApiResponse<{ id: string }> = await res.json();
      if (json.error) {
        setError(json.error);
        setSaving(false);
        return;
      }
      router.push(`/recipes/${json.data!.id}`);
    } catch {
      setError("保存に失敗しました");
      setSaving(false);
    }
  };

  // Ingredient helpers
  const addIngredient = () => setIngredients([...ingredients, { name: "", amount: "", unit: "" }]);
  const removeIngredient = (idx: number) => {
    if (ingredients.length <= 1) return;
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };
  const updateIngredient = (idx: number, field: keyof IngredientRow, value: string) => {
    setIngredients(ingredients.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)));
  };

  // Step helpers
  const addStep = () => setSteps([...steps, { instruction: "", tip: "" }]);
  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx));
  };
  const updateStep = (idx: number, field: keyof StepRow, value: string) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.back()} className="text-muted hover:text-foreground">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 text-base font-bold">{isNew ? "レシピ作成" : "レシピ編集"}</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存
        </button>
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      )}

      <div className="space-y-5 px-4">
        {/* Title */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">タイトル *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">説明</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        {/* Cook method + servings row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted">調理方法</label>
            <div className="flex gap-1.5">
              {COOK_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setCookMethod(m.value)}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    cookMethod === m.value
                      ? "bg-accent text-background"
                      : "bg-card text-muted hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="w-20">
            <label className="mb-1 block text-xs font-semibold text-muted">人数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={servingsBase}
              onChange={(e) => setServingsBase(parseInt(e.target.value) || 2)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-center text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Hotcook-specific */}
        {cookMethod === "hotcook" && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-muted">メニュー番号</label>
              <input
                type="text"
                value={hotcookMenuNumber}
                onChange={(e) => setHotcookMenuNumber(e.target.value)}
                placeholder="例: 001"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-muted">まぜ技ユニット</label>
              <input
                type="text"
                value={hotcookUnit}
                onChange={(e) => setHotcookUnit(e.target.value)}
                placeholder="あり / なし"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Time */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted">下ごしらえ (分)</label>
            <input
              type="number"
              min={0}
              value={prepTimeMin}
              onChange={(e) => setPrepTimeMin(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-muted">加熱時間 (分)</label>
            <input
              type="number"
              min={0}
              value={cookTimeMin}
              onChange={(e) => setCookTimeMin(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Ingredients */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-accent">材料</h2>
            <button
              type="button"
              onClick={addIngredient}
              className="flex items-center gap-1 text-xs text-accent hover:opacity-80"
            >
              <Plus size={14} />
              追加
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  placeholder="材料名"
                  className="flex-[3] rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                  placeholder="量"
                  className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-center text-sm focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                  placeholder="単位"
                  className="w-14 rounded-lg border border-border bg-background px-2 py-2 text-center text-sm focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  className="text-muted hover:text-danger"
                  disabled={ingredients.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-accent">手順</h2>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1 text-xs text-accent hover:opacity-80"
            >
              <Plus size={14} />
              追加
            </button>
          </div>
          <div className="space-y-3">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent mt-2">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <textarea
                    value={step.instruction}
                    onChange={(e) => updateStep(idx, "instruction", e.target.value)}
                    placeholder="手順を入力..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                  <input
                    type="text"
                    value={step.tip}
                    onChange={(e) => updateStep(idx, "tip", e.target.value)}
                    placeholder="コツ・ポイント（任意）"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="mt-2 text-muted hover:text-danger"
                  disabled={steps.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
