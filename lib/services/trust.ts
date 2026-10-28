export type RatingStatus = "rated" | "unrated" | "";

export type SellerTrust = {
  rated: boolean;
  ratingStatus: RatingStatus;
  ratingLabel: string;
  verified: boolean;
  badgeLabel: string;
};

export function shownRating(rating: number, ...srcs: Record<string, unknown>[]): number {
  const pick = (k: string) => srcs.map((d) => d[k]).find((v) => v !== undefined && v !== null);
  const status = pick("rating_status");
  if (status === "unrated") return 0;
  if (status === "rated") return rating;
  const reviews = pick("reviews_count");
  return reviews !== undefined && Number(reviews) <= 0 ? 0 : rating;
}

export function sellerTrustOf(d: Record<string, unknown>, rating: number, reviews: number): SellerTrust {
  const status: RatingStatus = d.rating_status === "rated" || d.rating_status === "unrated" ? d.rating_status : "";
  const badge = d.verification_badge && typeof d.verification_badge === "object" && !Array.isArray(d.verification_badge) ? (d.verification_badge as Record<string, unknown>) : null;
  const legacy = d.lexgo_verified ?? d.is_verified ?? d.verified;
  return {
    rated: status ? status === "rated" && rating > 0 : reviews >= 5 && rating > 0,
    ratingStatus: status,
    ratingLabel: typeof d.rating_label === "string" ? d.rating_label.trim() : "",
    verified: badge ? badge.visible === true : legacy === true,
    badgeLabel: badge && typeof badge.label === "string" ? badge.label.trim() : "",
  };
}
