import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aggregateIngredients } from "@/lib/utils/aggregate-ingredients";
import type { SlotWithRecipe } from "@/lib/utils/aggregate-ingredients";

// -- Zod schemas for FC args validation --

const recipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  servings_base: z.number().int().min(1).default(2),
  cook_method: z.enum(["hotcook", "stove", "other"]).default("other"),
  hotcook_menu_number: z.string().optional(),
  hotcook_unit: z.string().optional(),
  prep_time_min: z.number().int().min(0).optional(),
  cook_time_min: z.number().int().min(0).optional(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        amount: z.number().min(0),
        unit: z.string(),
        sort_order: z.number().int().min(0),
      })
    )
    .default([]),
  steps: z
    .array(
      z.object({
        step_number: z.number().int().min(1),
        instruction: z.string().min(1),
        tip: z.string().optional(),
      })
    )
    .default([]),
});

const slotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meal_type: z.enum(["lunch", "dinner"]),
  servings: z.number().int().min(1).max(10).default(2),
  is_skipped: z.boolean().default(false),
  memo: z.string().optional(),
  recipe_id: z.string().uuid().optional(),
  recipe: recipeSchema.optional(),
});

const saveWeeklyMenuArgsSchema = z.object({
  week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slots: z.array(slotSchema).min(1),
});

// -- Exported types (derived from Zod) --

export type SaveWeeklyMenuArgs = z.infer<typeof saveWeeklyMenuArgsSchema>;
export type ProposeWeeklyMenuArgs = SaveWeeklyMenuArgs;

// -- Validation helper --

export function validateSaveArgs(
  args: unknown
): { success: true; data: SaveWeeklyMenuArgs } | { success: false; error: string } {
  const result = saveWeeklyMenuArgsSchema.safeParse(args);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return {
      success: false,
      error: `引数が不正です。ingredients と steps を含めて再度 save_weekly_menu を呼んでください。詳細: ${issues}`,
    };
  }
  return { success: true, data: result.data };
}

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
  const { error: deleteError } = await supabase
    .from("meal_slots")
    .delete()
    .eq("weekly_menu_id", menu.id);
  if (deleteError) throw new Error(`meal_slots delete failed: ${deleteError.message}`);

  // 2. Save each slot + recipe
  for (const slot of args.slots) {
    let recipeId: string | null = null;

    // Priority 1: Use existing recipe by ID (hybrid mode — AI chose from DB)
    if (slot.recipe_id && !slot.is_skipped) {
      const { data: existing } = await supabase
        .from("recipes")
        .select("id")
        .eq("id", slot.recipe_id)
        .maybeSingle();
      if (existing) {
        recipeId = existing.id;
      }
    }

    // Priority 2: Use recipe object (new from AI, or fallback)
    if (!recipeId && slot.recipe && slot.recipe.title && !slot.is_skipped) {
      // Check existing recipe by title + cook_method for better dedup
      const { data: existing } = await supabase
        .from("recipes")
        .select("id")
        .eq("title", slot.recipe.title)
        .eq("cook_method", slot.recipe.cook_method)
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

        if (recipeError || !newRecipe) {
          throw new Error(recipeError?.message ?? "Failed to insert recipe");
        }
        recipeId = newRecipe.id;

        // Ingredients
        if (slot.recipe.ingredients.length > 0) {
          const { error: ingError } = await supabase.from("recipe_ingredients").insert(
            slot.recipe.ingredients.map((i) => ({ recipe_id: recipeId, ...i }))
          );
          if (ingError) throw new Error(`ingredients insert failed: ${ingError.message}`);
        }

        // Steps
        if (slot.recipe.steps.length > 0) {
          const { error: stepsError } = await supabase.from("recipe_steps").insert(
            slot.recipe.steps.map((s) => ({ recipe_id: recipeId, ...s }))
          );
          if (stepsError) throw new Error(`steps insert failed: ${stepsError.message}`);
        }
      }
    }

    // 3. Insert meal_slot
    const { error: slotError } = await supabase.from("meal_slots").insert({
      weekly_menu_id: menu.id,
      date: slot.date,
      meal_type: slot.meal_type,
      servings: slot.servings,
      recipe_id: recipeId,
      memo: slot.memo ?? null,
      is_skipped: slot.is_skipped,
    });
    if (slotError) throw new Error(`meal_slot insert failed: ${slotError.message}`);
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

  // 1.5 Get pantry items (for subtraction + staple exclusion)
  const { data: pantry } = await supabase
    .from("pantry_items")
    .select("name, amount, unit, is_staple");

  // 2. Aggregate (subtracting pantry, excluding staples)
  const aggregatedItems = aggregateIngredients(
    (slots || []) as unknown as SlotWithRecipe[],
    (pantry || []) as Parameters<typeof aggregateIngredients>[1]
  );

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
    const { error: itemsError } = await supabase.from("shopping_items").insert(
      aggregatedItems.map((item) => ({
        shopping_list_id: list.id,
        name: item.name,
        amount: item.totalAmount,
        unit: item.unit,
        category: item.category,
        is_checked: false,
      }))
    );
    if (itemsError) throw new Error(`shopping_items insert failed: ${itemsError.message}`);
  }

  return { shopping_list_id: list.id, items_count: aggregatedItems.length };
}
