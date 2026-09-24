# Secure client invitation fix

## Outcome
- Client invitation links will always create or convert the invited account into a client account on the server.
- Email confirmation will finish the remembered portal claim before deciding where to send the user.
- Accounts without a valid team invitation will never fall through into the realtor dashboard.
- Admins will see mismatches between invitation type, profile classification, and permission role.

## Implementation
1. Add an additive database migration that:
   - Changes new-profile classification to the least-privileged neutral/client state.
   - Updates the client-invite claim function to verify the signed-in email, attach the portal, classify the profile as client, remove incompatible team roles, and record the action atomically.
   - Ensures team roles are granted only when a valid admin-created team invitation is claimed.
   - Adds an insert-only invitation security audit trail with owner/admin visibility.
   - Replaces the broad portal property and transaction access rules with assigned-agent, approved operations/admin, and attached-client access.
2. Update signup confirmation so a remembered client invite is claimed immediately after email confirmation, then opens the client portal.
3. Tighten dashboard routing and guards so unclassified users and clients cannot enter the realtor workspace.
4. Add an admin-visible mismatch warning using the database audit and current account state.
5. Verify valid client signup, cross-route rejection, realtor invite behavior, cold confirmation redirect, dashboard denial, and existing correct client access. Run security checks and keep everything in preview.

## Compatibility and constraints
- Database changes remain additive; existing records are preserved.
- Access policies are only narrowed, never weakened.
- No publishing.
- Existing native-app routes and session persistence remain unchanged.
