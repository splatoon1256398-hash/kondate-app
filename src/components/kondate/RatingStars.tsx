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
      <div className="mb-1.5 flex items-center justify-between pl-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-label-secondary">
          評価
        </h2>
        <button
          type="button"
          onClick={toggleFavorite}
          className={`flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
            isFavorite ? "bg-red/10 text-red" : "bg-fill-tertiary text-label-secondary"
          }`}
        >
          <Heart size={12} fill={isFavorite ? "currentColor" : "none"} strokeWidth={2} />
          {isFavorite ? "殿堂入り" : "殿堂入りに"}
        </button>
      </div>

      <div className="rounded-[10px] bg-bg-grouped-secondary p-4">
        {/* User tabs - Segmented control */}
        <div className="flex gap-1 rounded-[8px] bg-fill-tertiary p-1">
          {(["れん", "あかね"] as UserName[]).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setActiveUser(name);
                const existing = ratings.find((r) => r.user_name === name);
                setComment(existing?.comment || "");
              }}
              className={`flex-1 rounded-[6px] py-1.5 text-[13px] font-semibold transition-all ${
                activeUser === name
                  ? "bg-bg-secondary text-label shadow-sm"
                  : "text-label-secondary"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {/* Stars */}
        <div className="mt-4 flex items-center justify-center gap-1">
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
                    : "text-gray3"
                }
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>

        {/* Comment toggle */}
        {userRating && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => setShowComment(!showComment)}
              className="mx-auto flex items-center gap-1 text-[13px] text-blue active:opacity-60"
            >
              <MessageSquare size={12} strokeWidth={2} />
              {userRating.comment ? "コメントを編集" : "コメントを追加"}
            </button>
          </div>
        )}

        {/* Comment input */}
        {showComment && (
          <div className="mt-3 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="美味しかった！次は多めに..."
              rows={3}
              className="w-full resize-none rounded-[10px] bg-fill-tertiary px-3 py-2 text-[15px] text-label placeholder:text-label-tertiary focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveComment}
              disabled={saving}
              className="flex h-9 w-full items-center justify-center rounded-[10px] bg-blue text-[15px] font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        )}

        {/* Other user */}
        {otherRating && (
          <div className="mt-4 rounded-[10px] bg-fill-tertiary p-3">
            <div className="flex items-center gap-2 text-[12px] text-label-secondary">
              <span className="font-semibold text-label">{otherUser}</span>
              <span className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    size={12}
                    className={i < otherRating.rating ? "fill-orange text-orange" : "text-gray3"}
                    strokeWidth={1.5}
                  />
                ))}
              </span>
            </div>
            {otherRating.comment && (
              <p className="mt-1 text-[13px] text-label-secondary">{otherRating.comment}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
