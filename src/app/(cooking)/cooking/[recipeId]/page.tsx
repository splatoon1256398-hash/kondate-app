import CookingMode from "@/components/kondate/CookingMode";

type Props = {
  params: Promise<{ recipeId: string }>;
};

export default async function CookingPage({ params }: Props) {
  const { recipeId } = await params;
  return <CookingMode recipeId={recipeId} />;
}
