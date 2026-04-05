import RecipeDetailPage from "@/components/kondate/RecipeDetailPage";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecipeViewPage({ params }: Props) {
  const { id } = await params;
  return <RecipeDetailPage recipeId={id} />;
}
