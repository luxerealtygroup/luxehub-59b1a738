export function canDisableTeamAccount(callerId: string, callerOrg: string | null, targetId: string, targetOrg: string | null, callerRoles: string[], targetRoles: string[]) {
  return callerId !== targetId && !!callerOrg && callerOrg === targetOrg &&
    callerRoles.includes('owner') && targetRoles.includes('agent') &&
    !targetRoles.some(role => role === 'owner' || role === 'admin');
}