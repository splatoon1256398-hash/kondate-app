import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 買い物リストのチェック済みアイテムを冷蔵庫在庫に追加
 */
export async function syncShoppingToPantry(
  supabase: SupabaseClient,
  shoppingListId: string
) {
  const { data: items } = await supabase
    .from("shopping_items")
    .select("name, amount, unit, category")
    .eq("shopping_list_id", shoppingListId)
    .eq("is_checked", true);

  if (!items?.length) return;

  for (const item of items) {
    const { data: existing } = await supabase
      .from("pantry_items")
      .select("id, amount")
      .eq("name", item.name)
      .eq("unit", item.unit || "")
      .maybeSingle();

    if (existing) {
      await supabase
        .from("pantry_items")
        .update({
          amount: (existing.amount || 0) + (item.amount || 0),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("pantry_items").insert({
        name: item.name,
        amount: item.amount,
        unit: item.unit,
        category: item.category,
        source: "shopping",
      });
    }
  }
}

/**
 * レシピの材料を在庫から差し引く
 */
export async function consumeIngredientsFromPantry(
  supabase: SupabaseClient,
  recipeId: string,
  servings: number
) {
  const { data: recipe } = await supabase
    .from("recipes")
    .select("servings_base, recipe_ingredients(name, amount, unit)")
    .eq("id", recipeId)
    .single();

  if (!recipe) return;

  const ratio = servings / recipe.servings_base;

  for (const ing of recipe.recipe_ingredients as { name: string; amount: number; unit: string }[]) {
    const consumed = ing.amount * ratio;

    const { data: pantryItem } = await supabase
      .from("pantry_items")
      .select("id, amount")
      .eq("name", ing.name)
      .maybeSingle();

    if (pantryItem) {
      const remaining = (pantryItem.amount || 0) - consumed;
      if (remaining <= 0) {
        await supabase.from("pantry_items").delete().eq("id", pantryItem.id);
      } else {
        await supabase
          .from("pantry_items")
          .update({ amount: remaining })
          .eq("id", pantryItem.id);
      }
    }
  }
}
