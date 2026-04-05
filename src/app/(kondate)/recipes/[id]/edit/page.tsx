import RecipeEditForm from "@/components/kondate/RecipeEditForm";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RecipeEditPage({ params }: Props) {
  const { id } = await params;
  return <RecipeEditForm recipeId={id} />;
}
