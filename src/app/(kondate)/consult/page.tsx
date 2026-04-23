import ConsultChat from "@/components/kondate/ConsultChat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  recipe_id?: string;
  servings?: string;
}>;

export default async function ConsultPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { recipe_id, servings } = await searchParams;

  if (!recipe_id) {
    return <ConsultChat />;
  }

  const parsed = servings ? parseInt(servings, 10) : NaN;
  const servingsNum = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;

  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("recipes")
    .select("id, title, servings_base")
    .eq("id", recipe_id)
    .maybeSingle();

  if (!data) {
    return <ConsultChat />;
  }

  return (
    <ConsultChat
      initialRecipeContext={{
        recipe_id: data.id as string,
        servings: servingsNum,
        title: data.title as string,
      }}
    />
  );
}
