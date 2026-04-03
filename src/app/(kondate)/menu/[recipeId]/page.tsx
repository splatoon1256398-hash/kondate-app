import RecipeDetail from "@/components/kondate/RecipeDetail";

type Props = {
  params: Promise<{ recipeId: string }>;
  searchParams: Promise<{ servings?: string }>;
};

export default async function RecipePage({ params, searchParams }: Props) {
  const { recipeId } = await params;
  const { servings } = await searchParams;

  return (
    <RecipeDetail
      recipeId={recipeId}
      servings={servings ? parseInt(servings, 10) : undefined}
    />
  );
}
