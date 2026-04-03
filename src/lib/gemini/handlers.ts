import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateIngredients } from "@/lib/utils/aggregate-ingredients";
import type { SlotWithRecipe } from "@/lib/utils/aggregate-ingredients";

// -- Types for FC args --

type RecipeArg = {
  title: string;
  description?: string;
  servings_base: number;
  cook_method: "hotcook" | "stove" | "other";
  hotcook_menu_number?: string;
  hotcook_unit?: string;
  prep_time_min?: number;
  cook_time_min?: number;
  ingredients: {
    name: string;
    amount: number;
    unit: string;
    sort_order: number;
  }[];
  steps: {
    step_number: number;
    instruction: string;
    tip?: string;
  }[];
};

type SlotArg = {
  date: string;
  meal_type: "lunch" | "dinner";
  servings: number;
  is_skipped?: boolean;
  memo?: string;
  recipe?: RecipeArg;
};

export type SaveWeeklyMenuArgs = {
  week_start_date: string;
  slots: SlotArg[];
};

export type ProposeWeeklyMenuArgs = {
  week_start_date: string;
  slots: SlotArg[];
};

// -- propose_weekly_menu --
// No DB writes — just return the args for the frontend to display.

export function executePropose(args: ProposeWeeklyMenuArgs) {
  return args;
}

// -- save_weekly_menu --

export async function executeSaveWeeklyMenu(
  supabase: SupabaseClient,
  args: SaveWeeklyMenuArgs
): Promise<{ weekly_menu_id: string; saved_slots: number }> {
  // 1. weekly_menus UPSERT
  const { data: menu, error: menuError } = await supabase
    .from("weekly_menus")
    .upsert(
      {
        week_start_date: args.week_start_date,
        status: "confirmed",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "week_start_date" }
    )
    .select("id")
    .single();

  if (menuError || !menu) throw new Error(menuError?.message ?? "Failed to upsert weekly_menu");

  // Delete existing slots (overwrite)
  await supabase.from("meal_slots").delete().eq("weekly_menu_id", menu.id);

  // 2. Save each slot + recipe
  for (const slot of args.slots) {
    let recipeId: string | null = null;

    if (slot.recipe && !slot.is_skipped) {
      // Check existing recipe by title
      const { data: existing } = await supabase
        .from("recipes")
        .select("id")
        .eq("title", slot.recipe.title)
        .maybeSingle();

      if (existing) {
        recipeId = existing.id;
      } else {
        const { data: newRecipe, error: recipeError } = await supabase
          .from("recipes")
          .insert({
            title: slot.recipe.title,
            description: slot.recipe.description ?? null,
            servings_base: slot.recipe.servings_base,
            cook_method: slot.recipe.cook_method,
            hotcook_menu_number: slot.recipe.hotcook_menu_number ?? null,
            hotcook_unit: slot.recipe.hotcook_unit ?? null,
            prep_time_min: slot.recipe.prep_time_min ?? null,
            cook_time_min: slot.recipe.cook_time_min ?? null,
            source: "ai",
          })
          .select("id")
          .single();

        if (recipeError || !newRecipe) throw new Error(recipeError?.message ?? "Failed to insert recipe");
        recipeId = newRecipe.id;

        // Ingredients
        if (slot.recipe.ingredients.length > 0) {
          await supabase.from("recipe_ingredients").insert(
            slot.recipe.ingredients.map((i) => ({ recipe_id: recipeId, ...i }))
          );
        }

        // Steps
        if (slot.recipe.steps.length > 0) {
          await supabase.from("recipe_steps").insert(
            slot.recipe.steps.map((s) => ({ recipe_id: recipeId, ...s }))
          );
        }
      }
    }

    // 3. Insert meal_slot
    await supabase.from("meal_slots").insert({
      weekly_menu_id: menu.id,
      date: slot.date,
      meal_type: slot.meal_type,
      servings: slot.servings,
      recipe_id: recipeId,
      memo: slot.memo ?? null,
      is_skipped: slot.is_skipped || false,
    });
  }

  return { weekly_menu_id: menu.id, saved_slots: args.slots.length };
}

// -- generate_shopping_list --

export async function executeGenerateShoppingList(
  supabase: SupabaseClient,
  args: { weekly_menu_id: string }
): Promise<{ shopping_list_id: string; items_count: number }> {
  // 1. Get slots + recipe ingredients
  const { data: slots } = await supabase
    .from("meal_slots")
    .select("servings, recipes ( servings_base, recipe_ingredients (*) )")
    .eq("weekly_menu_id", args.weekly_menu_id)
    .eq("is_skipped", false)
    .not("recipe_id", "is", null);

  // 2. Aggregate
  const aggregatedItems = aggregateIngredients((slots || []) as unknown as SlotWithRecipe[]);

  // 3. Delete existing shopping list for this menu (if any)
  await supabase.from("shopping_lists").delete().eq("weekly_menu_id", args.weekly_menu_id);

  // 4. Insert shopping_list
  const { data: list, error: listError } = await supabase
    .from("shopping_lists")
    .insert({ weekly_menu_id: args.weekly_menu_id, status: "active" })
    .select("id")
    .single();

  if (listError || !list) throw new Error(listError?.message ?? "Failed to create shopping list");

  // 5. Insert items
  if (aggregatedItems.length > 0) {
    await supabase.from("shopping_items").insert(
      aggregatedItems.map((item) => ({
        shopping_list_id: list.id,
        name: item.name,
        amount: item.totalAmount,
        unit: item.unit,
        category: item.category,
        is_checked: false,
      }))
    );
  }

  return { shopping_list_id: list.id, items_count: aggregatedItems.length };
}
