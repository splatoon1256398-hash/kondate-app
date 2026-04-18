import RecipeDetail from "@/components/kondate/RecipeDetail";

type Props = {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ servings?: string; slot_id?: string }>;
};

export default async function RecipePage({ params, searchParams }: Props) {
  const { recipeId } = await params;
  const { servings, slot_id } = await searchParams;

  return (
    <RecipeDetail
      recipeId={recipeId}
      servings={servings ? parseInt(servings, 10) : undefined}
      slotId={slot_id}
    />
  );
}
