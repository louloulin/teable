/**
 * Lightweight token estimator for chat history.
 * Uses the same heuristic as the AI Field module (~4 chars/token).
 */

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
