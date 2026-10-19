/**
 * What the Hat Brand Film price note must disclose. Mirrors the recipe bounds
 * (tests assert they match): one automatic retry per shot, 11 checked shots,
 * one reference analysis. Product-check pricing is not verified, so it is
 * reported as unavailable rather than invented.
 */
export const HAT_FILM_RETRIES_PER_SHOT = 1;
export const HAT_FILM_CHECKED_SHOTS = 11;

export function hatFilmCostDisclosure(baseCredits: number) {
  return {
    baseCredits,
    maxCredits: baseCredits * (1 + HAT_FILM_RETRIES_PER_SHOT),
    maxRetriesPerShot: HAT_FILM_RETRIES_PER_SHOT,
    checks: { base: 1 + HAT_FILM_CHECKED_SHOTS, max: 1 + HAT_FILM_CHECKED_SHOTS * (1 + HAT_FILM_RETRIES_PER_SHOT), priceAvailable: false },
    liveTotalVerified: false,
  };
}
