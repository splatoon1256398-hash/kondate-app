import { Suspense } from "react";
import RecipeList from "@/components/kondate/RecipeList";

export default function RecipesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue border-t-transparent" />
        </div>
      }
    >
      <RecipeList />
    </Suspense>
  );
}
