import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/common";

/** Strip HTML tags from text */
function stripHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, "") // remove img tags entirely
    .replace(/<[^>]+>/g, "")     // remove all other tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/#→#/g, " → ")     // fix COCORO+ separator
    .trim();
}

// Default model — KN-HW24G is a common 2.4L model
const DEFAULT_MODEL = "KN-HW24G";

// Whitelist of allowed model IDs
const ALLOWED_MODELS = new Set([
  "KN-HW24H", "KN-HW16H",
  "KN-HW24G", "KN-HW16G",
  "KN-HW24F", "KN-HW16F",
  "KN-HW24E", "KN-HW16E",
]);

// recipe_id must be alphanumeric (e.g. "R4325", "4325")
const RECIPE_ID_PATTERN = /^[A-Za-z0-9]{1,20}$/;

type HotcookIngredient = {
  name?: string;
  amount?: string;
};

type HotcookStep = {
  description?: string;
  tips?: string;
};

type HotcookRecipeResponse = {
  // New API format
  name?: string;
  cookingTime?: string;
  quantity?: string;
  materials?: { name?: string; quantity?: string; orderNumber?: number; group?: string | null }[];
  methods?: { text?: string; renderedHtml?: string; orderNumber?: number }[];
  imageUrl?: string;
  // Old API format (fallbacks)
  recipeName?: string;
  recipeNameKana?: string;
  menuNo?: string;
  servings?: string;
  mixingUnit?: string;
  cookTime?: string | number;
  ingredients?: HotcookIngredient[];
  steps?: HotcookStep[];
  [key: string]: unknown;
};

/**
 * POST /api/hotcook-import
 * Body: { recipe_id: string, model?: string }
 *
 * Fetches a recipe from the SHARP COCORO+ API and saves it to the recipes table.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const recipeId: string = body.recipe_id?.trim() ?? "";
    const model: string = body.model || DEFAULT_MODEL;

    if (!recipeId) {
      return NextResponse.json(
        { data: null, error: "recipe_id is required" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // Validate recipe_id format (prevent path traversal / injection)
    if (!RECIPE_ID_PATTERN.test(recipeId)) {
      return NextResponse.json(
        { data: null, error: "recipe_id の形式が不正です（英数字のみ）" } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // Validate model against whitelist
    if (!ALLOWED_MODELS.has(model)) {
      return NextResponse.json(
        { data: null, error: `未対応の機種です: ${model}` } satisfies ApiResponse<null>,
        { status: 400 }
      );
    }

    // Fetch from SHARP COCORO+ API
    const apiUrl = `https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/${recipeId}/${model}`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { data: null, error: `ホットクックAPIエラー: ${res.status}` } satisfies ApiResponse<null>,
        { status: 502 }
      );
    }

    const raw: HotcookRecipeResponse = await res.json();

    // Parse the response — handle both new API format (name/materials/methods) and old format (recipeName/ingredients/steps)
    const title = (raw.name || raw.recipeName || "").trim();
    if (!title) {
      return NextResponse.json(
        { data: null, error: "このレシピはこの機種に対応していません" } satisfies ApiResponse<null>,
        { status: 404 }
      );
    }
    const menuNo = raw.menuNo || recipeId;
    const mixingUnit = raw.mixingUnit || "";
    const servingsText = raw.quantity || raw.servings || "2";
    const servingsBase = parseInt(servingsText.replace(/[^0-9]/g, "")) || 2;
    const cookTimeStr = raw.cookingTime || (raw.cookTime != null ? String(raw.cookTime) : "");
    const cookTimeMatch = cookTimeStr.match(/(\d+)/);
    const cookTimeMin = cookTimeMatch ? parseInt(cookTimeMatch[1]) : null;

    // Parse ingredients — new format: materials[].quantity + .group, old format: ingredients[].amount
    const rawMaterials = raw.materials || [];
    const rawIngredients = raw.ingredients || [];
    const ingredientSource = rawMaterials.length > 0
      ? rawMaterials.map((m) => ({ name: m.name, amount: m.quantity, group: m.group }))
      : rawIngredients.map((i) => ({ name: i.name, amount: i.amount, group: null as string | null }));

    const ingredients = ingredientSource
      .filter((i) => i.name)
      .map((i, idx) => {
        const amountStr = i.amount || "";
        const numMatch = amountStr.match(/^[\d.]+/);
        const amount = numMatch ? parseFloat(numMatch[0]) : 0;
        const unit = numMatch ? amountStr.slice(numMatch[0].length).trim() : amountStr.trim();
        // Prefix A/B group (e.g. "A ", "B ") to name so it matches the original Hotcook display
        // and step references like "[A]を入れる" remain meaningful.
        const groupPrefix = i.group ? String(i.group).trim() + " " : "";
        const baseName = i.name!.trim();
        return {
          name: groupPrefix + baseName,
          amount,
          unit: unit || "適量",
          sort_order: idx + 1,
        };
      });

    // Parse steps — new format: methods[].text, old format: steps[].description
    const rawMethods = raw.methods || [];
    const rawSteps = raw.steps || [];
    const stepSource = rawMethods.length > 0
      ? rawMethods.map((m) => ({ description: m.text || m.renderedHtml, tips: undefined as string | undefined }))
      : rawSteps;

    const steps = stepSource
      .filter((s) => s.description)
      .map((s, idx) => {
        const cleaned = stripHtml(s.description!);
        return cleaned ? { step_number: idx + 1, instruction: cleaned, tip: s.tips?.trim() || null } : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.instruction.length > 0);

    // Image URL
    const imageUrl = raw.imageUrl || null;

    // Save to DB
    const supabase = createSupabaseServerClient();

    // Check if already imported
    const { data: existing } = await supabase
      .from("recipes")
      .select("id")
      .eq("title", title)
      .eq("source", "imported")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { data: { id: existing.id, already_exists: true }, error: null } satisfies ApiResponse<{
          id: string;
          already_exists: boolean;
        }>,
        { status: 200 }
      );
    }

    // Insert recipe
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .insert({
        title,
        description: null,
        servings_base: servingsBase,
        cook_method: "hotcook" as const,
        hotcook_menu_number: menuNo,
        hotcook_unit: mixingUnit || null,
        prep_time_min: null,
        cook_time_min: cookTimeMin,
        source: "imported" as const,
        image_url: imageUrl,
      })
      .select("id")
      .single();

    if (recipeError || !recipe) {
      return NextResponse.json(
        { data: null, error: recipeError?.message ?? "Failed to insert recipe" } satisfies ApiResponse<null>,
        { status: 500 }
      );
    }

    // Insert ingredients
    if (ingredients.length > 0) {
      const { error: ingError } = await supabase.from("recipe_ingredients").insert(
        ingredients.map((i) => ({ recipe_id: recipe.id, ...i }))
      );
      if (ingError) {
        return NextResponse.json(
          { data: null, error: ingError.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    // Insert steps
    if (steps.length > 0) {
      const { error: stepsError } = await supabase.from("recipe_steps").insert(
        steps.map((s) => ({ recipe_id: recipe.id, ...s }))
      );
      if (stepsError) {
        return NextResponse.json(
          { data: null, error: stepsError.message } satisfies ApiResponse<null>,
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        data: {
          id: recipe.id,
          already_exists: false,
          title,
          ingredients_count: ingredients.length,
          steps_count: steps.length,
        },
        error: null,
      } satisfies ApiResponse<{
        id: string;
        already_exists: boolean;
        title: string;
        ingredients_count: number;
        steps_count: number;
      }>,
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json(
      { data: null, error: message } satisfies ApiResponse<null>,
      { status: 500 }
    );
  }
}
