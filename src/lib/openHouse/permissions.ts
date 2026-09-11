/**
 * Who may change an open house.
 *
 * Editable by: the hosting agent, the listing agent, whoever created it, and
 * every admin or owner in the same organisation. Everyone else is read-only,
 * which matches the row-level rules on `open_houses` and
 * `open_house_visitors`, so buttons we hide are exactly the ones the database
 * would refuse anyway.
 */
export function canManageOpenHouse(
  house: {
    user_id?: string | null;
    hosting_agent_id?: string | null;
    listing_agent_id?: string | null;
  } | null | undefined,
  userId: string | null | undefined,
  isAdminOrOwner: boolean,
): boolean {
  if (isAdminOrOwner) return true;
  if (!house || !userId) return false;
  return (
    house.hosting_agent_id === userId ||
    house.listing_agent_id === userId ||
    house.user_id === userId
  );
}
