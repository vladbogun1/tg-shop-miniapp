interface Flags {
  isLoading: boolean;
  isError: boolean;
}

/** Loading / failed / nothing-to-show flags of the reviews screen, from its three queries. */
export function reviewsScreenState(input: {
  hasToken: boolean;
  queries: [Flags, Flags, Flags];
  showPending: boolean;
  mineCount: number;
  bonusCount: number;
}) {
  const loading = !input.hasToken || input.queries.some((q) => q.isLoading);
  const failed = input.queries.some((q) => q.isError);
  const nothing = !loading && !failed && !input.showPending && input.mineCount === 0 && input.bonusCount === 0;
  return { loading, failed, nothing };
}
