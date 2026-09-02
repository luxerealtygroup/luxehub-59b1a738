/**
 * Regression test for the Manage-portal freeze / duplicate-insert bug.
 *
 * Previously the dialog looked the portal up by whatever was typed in the email
 * box, so each keystroke re-ran the query, merged the fetched row back over the
 * form (losing edits), flipped `account` to null (disabling the tabs and turning
 * Save into "Create portal") and, on save, INSERTED a second client_accounts row.
 * The setForm -> lookupKey -> effect -> setForm cycle also pinned the main thread.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const EXISTING = {
  id: 'portal-1',
  email: 'pullman53@icloud.com',
  full_name: 'Pat Ullman',
  fub_person_id: 11355,
  client_type: 'seller',
  drive_folder_id: null,
  slack_channel_id: null,
  invited_by: 'agent-terra',
};

const calls = { selects: 0, updates: 0, inserts: 0 };

function tableMock(table: string) {
  if (table !== 'client_accounts') {
    return {
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
    } as any;
  }
  const single = async () => ({ data: EXISTING, error: null });
  return {
    select: () => {
      calls.selects += 1;
      const chain: any = {
        limit: () => chain,
        eq: () => chain,
        maybeSingle: single,
        single,
        order: async () => ({ data: [], error: null }),
      };
      return chain;
    },
    update: () => {
      calls.updates += 1;
      const chain: any = { eq: () => chain, select: () => chain, single };
      return chain;
    },
    insert: () => {
      calls.inserts += 1;
      const chain: any = { select: () => chain, single };
      return chain;
    },
  } as any;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => tableMock(t),
    rpc: async () => ({ data: [], error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    storage: { from: () => ({ list: async () => ({ data: [] }) }) },
  },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'agent-terra', email: 'terra@focusrealtygroup.ca' } }),
}));
vi.mock('@/hooks/useUserRole', () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock('@/hooks/useOrgTier', () => ({ useOrgTier: () => ({ canAccessCRMConnections: false }) }));
vi.mock('@/lib/api/followUpBoss', () => ({
  followUpBossApi: new Proxy({}, { get: () => async () => ({ data: {} }) }),
}));
vi.mock('@/hooks/usePortalDealSuggestions', () => ({
  usePortalDealSuggestions: () => ({ suggestions: [], linkedDealIds: [], dismiss: () => {}, recheck: () => {} }),
}));
vi.mock('@/hooks/usePortalProperties', () => ({
  usePortalProperties: () => ({ properties: [], transactions: [], reload: () => {} }),
  derivePortalSideLabel: () => 'Seller',
}));
vi.mock('@/pages/client-portal/components/FUBTimeline', () => ({ FUBTimeline: () => null }));
vi.mock('@/pages/client-portal/components/ClientTaskList', () => ({ ClientTaskList: () => null }));
vi.mock('@/components/FUBContactTypeahead', () => ({ FUBContactTypeahead: () => null }));
vi.mock('@/components/SlackChannelPicker', () => ({ SlackChannelPicker: () => null }));
vi.mock('@/components/portal/PortalDocumentsPanel', () => ({ PortalDocumentsPanel: () => null }));
vi.mock('@/components/portal/PortalContactsPanel', () => ({ PortalContactsPanel: () => null }));
vi.mock('@/components/portal/PortalPhotosPanel', () => ({ PortalPhotosPanel: () => null }));
vi.mock('@/components/portal/PortalChatPanel', () => ({ PortalChatPanel: () => null }));
vi.mock('@/components/portal/PortalPropertiesManager', () => ({ PortalPropertiesManager: () => null }));
vi.mock('@/components/portal/PropertySwitcher', () => ({ PropertySwitcher: () => null }));
vi.mock('@/components/portal/FubDealPicker', () => ({ FubDealPicker: () => null }));
vi.mock('@/components/portal/PortalDealSuggestions', () => ({ PortalDealSuggestions: () => null }));

import { AgentPortalDialog } from '@/components/AgentPortalDialog';

describe('AgentPortalDialog identity stability', () => {
  beforeEach(() => {
    calls.selects = 0;
    calls.updates = 0;
    calls.inserts = 0;
  });

  it('keeps the portal bound while the email is edited, and updates instead of inserting', async () => {
    render(
      <MemoryRouter>
        <AgentPortalDialog clientEmail={EXISTING.email} clientName={EXISTING.full_name} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /client portal/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /setup/i }));
    await screen.findByRole('button', { name: /save changes/i });

    const selectsAfterLoad = calls.selects;
    const emailInput = screen.getByDisplayValue(EXISTING.email) as HTMLInputElement;

    // Type a new address one character at a time — the old code re-queried and
    // clobbered the field on every keystroke.
    const next = 'pat.ullman@example.com';
    fireEvent.change(emailInput, { target: { value: next } });

    await waitFor(() => expect(emailInput.value).toBe(next));
    // No render loop / re-lookup was triggered by typing.
    expect(calls.selects).toBe(selectsAfterLoad);
    // Still bound to the existing portal.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /create portal/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(calls.updates).toBe(1));
    expect(calls.inserts).toBe(0);
  });

  it('rejects junk emails like "rt" instead of creating a portal', async () => {
    render(
      <MemoryRouter>
        <AgentPortalDialog clientEmail={EXISTING.email} clientName={EXISTING.full_name} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /client portal/i }));
    fireEvent.click(await screen.findByRole('tab', { name: /setup/i }));
    const saveBtn = await screen.findByRole('button', { name: /save changes/i });

    fireEvent.change(screen.getByDisplayValue(EXISTING.email), { target: { value: 'rt' } });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(calls.inserts).toBe(0));
    expect(calls.updates).toBe(0);
  });
});
