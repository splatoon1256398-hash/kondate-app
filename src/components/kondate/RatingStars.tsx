"use client";

import { useState, useCallback, useEffect } from "react";
import { Star, Heart, MessageSquare } from "lucide-react";
import type { RecipeRating, CreateRating, UserName } from "@/types/rating";
import type { ApiResponse } from "@/types/common";

type Props = {
  recipeId: string;
  isFavorite: boolean;
  onFavoriteChange: (isFavorite: boolean) => void;
};

export default function RatingStars({ recipeId, isFavorite, onFavoriteChange }: Props) {
  const [ratings, setRatings] = useState<RecipeRating[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeUser, setActiveUser] = useState<UserName>("れん");
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/recipes/${recipeId}/ratings`);
        const json: ApiResponse<RecipeRating[]> = await res.json();
        if (!cancelled && json.data) {
          setRatings(json.data);
          const existing = json.data.find((r) => r.user_name === activeUser);
          if (existing?.comment) setComment(existing.comment);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, [recipeId]);

  const userRating = ratings.find((r) => r.user_name === activeUser);
  const otherUser: UserName = activeUser === "れん" ? "あかね" : "れん";
  const otherRating = ratings.find((r) => r.user_name === otherUser);

  const handleRate = useCallback(
    async (rating: number) => {
      setSaving(true);
      const body: CreateRating = {
        user_name: activeUser,
        rating,
        comment: comment || undefined,
      };

      const res = await fetch(`/api/recipes/${recipeId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: ApiResponse<RecipeRating> = await res.json();
      if (json.data) {
        setRatings((prev) => {
          const filtered = prev.filter((r) => r.user_name !== activeUser);
          return [...filtered, json.data!];
        });
      }
      setSaving(false);
      // Refresh favorite state
      const favRes = await fetch(`/api/recipes/${recipeId}`);
      const favJson = await favRes.json();
      if (favJson.data) {
        onFavoriteChange(favJson.data.is_favorite);
      }
    },
    [recipeId, activeUser, comment, onFavoriteChange]
  );

  const handleSaveComment = useCallback(async () => {
    if (!userRating) return;
    await handleRate(userRating.rating);
    setShowComment(false);
  }, [userRating, handleRate]);

  const toggleFavorite = useCallback(async () => {
    const newVal = !isFavorite;
    onFavoriteChange(newVal);
    await fetch(`/api/recipes/${recipeId}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: newVal }),
    });
  }, [recipeId, isFavorite, onFavoriteChange]);

  return (
    <section className="mt-5 px-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-accent">評価</h2>
        <button
          type="button"
          onClick={toggleFavorite}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all ${
            isFavorite
              ? "bg-danger/10 text-danger"
              : "bg-card text-muted hover:text-foreground"
          }`}
        >
          <Heart size={14} fill={isFavorite ? "currentColor" : "none"} />
          {isFavorite ? "殿堂入り" : "殿堂入りにする"}
        </button>
      </div>

      {/* User tabs */}
      <div className="mt-3 flex gap-1">
        {(["れん", "あかね"] as UserName[]).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setActiveUser(name);
              const existing = ratings.find((r) => r.user_name === name);
              setComment(existing?.comment || "");
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
              activeUser === name
                ? "bg-accent text-background"
                : "bg-card text-muted"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Stars */}
      <div className="mt-3 flex items-center justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => handleRate(n)}
            disabled={saving}
            className="p-1 transition-transform active:scale-110 disabled:opacity-50"
          >
            <Star
              size={32}
              className={
                (userRating?.rating ?? 0) >= n
                  ? "fill-orange text-orange"
                  : "text-border"
              }
            />
          </button>
        ))}
      </div>

      {/* Comment toggle */}
      {userRating && (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => setShowComment(!showComment)}
            className="flex items-center gap-1 mx-auto text-[11px] text-muted hover:text-foreground"
          >
            <MessageSquare size={12} />
            {userRating.comment ? "コメントを編集" : "コメントを追加"}
          </button>
        </div>
      )}

      {/* Comment input */}
      {showComment && (
        <div className="mt-2 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="美味しかった！次は多めに作ろう..."
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveComment}
            disabled={saving}
            className="w-full rounded-lg bg-card py-2 text-xs font-medium text-foreground transition-colors hover:bg-card-hover disabled:opacity-50"
          >
            保存
          </button>
        </div>
      )}

      {/* Other user's rating */}
      {otherRating && (
        <div className="mt-3 rounded-lg bg-card p-2.5">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-foreground">{otherUser}</span>
            <span className="flex items-center gap-0.5">
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  size={12}
                  className={
                    i < otherRating.rating
                      ? "fill-orange text-orange"
                      : "text-border"
                  }
                />
              ))}
            </span>
          </div>
          {otherRating.comment && (
            <p className="mt-1 text-xs text-muted">{otherRating.comment}</p>
          )}
        </div>
      )}
    </section>
  );
}
