/**
 * Normalized ordering key for an unordered pair of user ids.
 *
 * Returns `{a}|{b}` with the lexicographically smaller id first, so the key is
 * identical for A→B and B→A. The FriendRequest table has a partial unique
 * index on this key (WHERE status = 'PENDING'), which is how the database
 * prevents two simultaneous PENDING requests between the same two users
 * regardless of direction.
 */
export function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
