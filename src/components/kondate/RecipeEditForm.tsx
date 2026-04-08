"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Trash2, Loader2 } from "lucide-react";
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="bg-bg-grouped pb-8">
      {/* Navigation Bar */}
      <div className="material-bar separator-bottom flex items-center px-2 py-2.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-0.5 px-2 text-[17px] text-blue active:opacity-60"
        >
          <ChevronLeft size={22} strokeWidth={2.5} />
          戻る
        </button>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-label">
          {isNew ? "新規レシピ" : "編集"}
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-2 text-[17px] font-semibold text-blue active:opacity-60 disabled:opacity-30"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : "保存"}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-[10px] bg-red/10 px-3 py-2.5 text-[13px] text-red">{error}</div>
      )}

      <div className="mt-3 space-y-5 px-4">
        {/* Basic info */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            基本情報
          </h2>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            <div className="flex min-h-[44px] items-center px-4">
              <span className="w-20 shrink-0 text-[17px] text-label">タイトル</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="必須"
                className="flex-1 bg-transparent py-3 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
              />
            </div>
            <div className="flex min-h-[44px] items-start px-4 py-2">
              <span className="w-20 shrink-0 pt-1 text-[17px] text-label">説明</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="任意"
                className="flex-1 resize-none bg-transparent py-1 text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
              />
            </div>
            <div className="flex min-h-[44px] items-center px-4">
              <span className="w-20 shrink-0 text-[17px] text-label">人数</span>
              <input
                type="number"
                min={1}
                max={10}
                value={servingsBase}
                onChange={(e) => setServingsBase(parseInt(e.target.value) || 2)}
                className="w-20 bg-transparent py-3 text-right text-[17px] text-label focus:outline-none"
              />
              <span className="ml-1 text-[15px] text-label-secondary">人分</span>
            </div>
          </div>
        </section>

        {/* Cook method */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            調理方法
          </h2>
          <div className="flex gap-1 rounded-[8px] bg-fill-tertiary p-1">
            {COOK_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setCookMethod(m.value)}
                className={`flex-1 rounded-[6px] py-1.5 text-[13px] font-semibold transition-all ${
                  cookMethod === m.value
                    ? "bg-bg-secondary text-label shadow-sm"
                    : "text-label-secondary"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* Hotcook-specific */}
        {cookMethod === "hotcook" && (
          <section>
            <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
              ホットクック
            </h2>
            <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
              <div className="flex min-h-[44px] items-center px-4">
                <span className="w-32 shrink-0 text-[17px] text-label">メニュー番号</span>
                <input
                  type="text"
                  value={hotcookMenuNumber}
                  onChange={(e) => setHotcookMenuNumber(e.target.value)}
                  placeholder="例: 001"
                  className="flex-1 bg-transparent py-3 text-right text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
              </div>
              <div className="flex min-h-[44px] items-center px-4">
                <span className="w-32 shrink-0 text-[17px] text-label">まぜ技</span>
                <input
                  type="text"
                  value={hotcookUnit}
                  onChange={(e) => setHotcookUnit(e.target.value)}
                  placeholder="あり / なし"
                  className="flex-1 bg-transparent py-3 text-right text-[17px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
              </div>
            </div>
          </section>
        )}

        {/* Time */}
        <section>
          <h2 className="mb-1.5 pl-4 text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
            時間
          </h2>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            <div className="flex min-h-[44px] items-center px-4">
              <span className="flex-1 text-[17px] text-label">下ごしらえ</span>
              <input
                type="number"
                min={0}
                value={prepTimeMin}
                onChange={(e) => setPrepTimeMin(e.target.value)}
                className="w-16 bg-transparent py-3 text-right text-[17px] text-label focus:outline-none"
              />
              <span className="ml-1 text-[15px] text-label-secondary">分</span>
            </div>
            <div className="flex min-h-[44px] items-center px-4">
              <span className="flex-1 text-[17px] text-label">加熱時間</span>
              <input
                type="number"
                min={0}
                value={cookTimeMin}
                onChange={(e) => setCookTimeMin(e.target.value)}
                className="w-16 bg-transparent py-3 text-right text-[17px] text-label focus:outline-none"
              />
              <span className="ml-1 text-[15px] text-label-secondary">分</span>
            </div>
          </div>
        </section>

        {/* Ingredients */}
        <section>
          <div className="mb-1.5 flex items-center justify-between pl-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
              材料
            </h2>
            <button
              type="button"
              onClick={addIngredient}
              className="flex items-center gap-1 text-[13px] font-semibold text-blue active:opacity-60"
            >
              <Plus size={12} strokeWidth={2.5} />
              追加
            </button>
          </div>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2">
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                  placeholder="材料名"
                  className="flex-[3] bg-transparent py-2 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
                <input
                  type="text"
                  value={ing.amount}
                  onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                  placeholder="量"
                  className="w-12 bg-transparent text-center text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                  placeholder="単位"
                  className="w-12 bg-transparent text-center text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  className="text-red active:opacity-60"
                  disabled={ingredients.length <= 1}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section>
          <div className="mb-1.5 flex items-center justify-between pl-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
              手順
            </h2>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1 text-[13px] font-semibold text-blue active:opacity-60"
            >
              <Plus size={12} strokeWidth={2.5} />
              追加
            </button>
          </div>
          <div className="cell-separator overflow-hidden rounded-[10px] bg-bg-grouped-secondary">
            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-2 px-3 py-2.5">
                <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue text-[12px] font-bold text-white">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-1">
                  <textarea
                    value={step.instruction}
                    onChange={(e) => updateStep(idx, "instruction", e.target.value)}
                    placeholder="手順を入力..."
                    rows={2}
                    className="w-full resize-none rounded-[8px] bg-fill-tertiary px-3 py-1.5 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
                  />
                  <input
                    type="text"
                    value={step.tip}
                    onChange={(e) => updateStep(idx, "tip", e.target.value)}
                    placeholder="コツ・ポイント（任意）"
                    className="w-full rounded-[8px] bg-fill-tertiary px-3 py-1.5 text-[13px] text-label placeholder:text-label-tertiary focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(idx)}
                  className="mt-2 text-red active:opacity-60"
                  disabled={steps.length <= 1}
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
