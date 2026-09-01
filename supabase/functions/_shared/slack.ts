/**
 * Slack wiring for THIS instance.
 *
 * One Slack bot token per deployed instance, from Vault or project secrets. Nothing here assumes a particular
 * workspace, team id or channel naming convention: the workspace identity is
 * discovered at runtime from auth.test, and any channel that does not belong to
 * the token's workspace fails loudly instead of silently doing nothing.
 */

import { getInstanceSecret } from './instanceSecrets.ts';

export const SLACK_API = 'https://slack.com/api';

export class SlackConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackConfigError';
  }
}

/** The bot token, or a thrown SlackConfigError. Never a default. */
export async function getSlackToken(): Promise<string> {
  const t = await getInstanceSecret('SLACK_BOT_TOKEN');
  if (!t) {
    throw new SlackConfigError(
      'Slack is not connected for this instance. The owner can add the bot token on the Setup page.',
    );
  }
  return t;
}

/** Slack request-signing secret, or null when Slack is not connected. */
export async function getSlackSigningSecret(): Promise<string | null> {
  return await getInstanceSecret('SLACK_SIGNING_SECRET');
}

export interface SlackWorkspace {
  teamId: string;
  teamName: string;
  botUserId: string;
  url: string;
}

/** Identify the workspace the configured token actually belongs to. */
export async function getWorkspace(): Promise<SlackWorkspace> {
  const res = await fetch(`${SLACK_API}/auth.test`, {
    headers: { Authorization: `Bearer ${await getSlackToken()}` },
  });
  const data = await res.json().catch(() => ({ ok: false, error: 'non_json_response' }));
  if (!data.ok) {
    throw new SlackConfigError(
      `SLACK_BOT_TOKEN was rejected by Slack (${data.error ?? 'unknown_error'}). ` +
        'The token is invalid, revoked, or from a different workspace.',
    );
  }
  return {
    teamId: data.team_id,
    teamName: data.team,
    botUserId: data.user_id,
    url: data.url,
  };
}

export interface ChannelCheck {
  ok: boolean;
  /** Human-readable reason, safe to show an agent. */
  error?: string;
  channelName?: string;
  teamId?: string;
}

/**
 * Confirm a linked channel id is reachable with this instance's token and lives
 * in the same workspace. Distinguishes "wrong workspace" from "bot not invited"
 * so an agent sees a fixable message rather than a silent no-op.
 */
export async function assertChannelInWorkspace(channelId: string): Promise<ChannelCheck> {
  let workspace: SlackWorkspace;
  try {
    workspace = await getWorkspace();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const res = await fetch(
    `${SLACK_API}/conversations.info?channel=${encodeURIComponent(channelId)}`,
    { headers: { Authorization: `Bearer ${await getSlackToken()}` } },
  );
  const data = await res.json().catch(() => ({ ok: false, error: 'non_json_response' }));

  if (!data.ok) {
    if (data.error === 'channel_not_found') {
      return {
        ok: false,
        teamId: workspace.teamId,
        error:
          `Channel ${channelId} does not exist in the “${workspace.teamName}” Slack workspace this app is ` +
          'connected to. It was most likely linked from a different workspace — re-link the channel.',
      };
    }
    if (data.error === 'not_in_channel' || data.error === 'channel_not_visible') {
      return {
        ok: false,
        teamId: workspace.teamId,
        error: `The bot is not a member of ${channelId}. Invite it to the channel and try again.`,
      };
    }
    return { ok: false, teamId: workspace.teamId, error: `Slack error: ${data.error}` };
  }

  const channelTeam = data.channel?.shared_team_ids?.[0] ?? data.channel?.context_team_id;
  if (channelTeam && channelTeam !== workspace.teamId) {
    return {
      ok: false,
      teamId: workspace.teamId,
      error:
        `Channel ${channelId} belongs to a different Slack workspace than this app's bot token ` +
        `(“${workspace.teamName}”). Re-link the channel from the connected workspace.`,
    };
  }

  return { ok: true, channelName: data.channel?.name, teamId: workspace.teamId };
}
