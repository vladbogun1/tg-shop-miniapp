export const supportKeys = {
  config: ["me", "support", "config"] as const,
  threads: ["me", "support", "threads"] as const,
  thread: (id: string) => ["me", "support", "thread", id] as const,
  product: (id: string | null) => ["product", id] as const,
};
