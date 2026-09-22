import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { conditionLabel } from '@/lib/portalConditions';
import { keyDateLabel } from '@/lib/portalKeyDates';

export type ImportantDateType =
  | 'closing'
  | 'condition'
  | 'deposit'
  | 'inspection'
  | 'walkthrough'
  | 'other';

export interface ImportantDateEntry {
  id: string;
  date: string;
  type: ImportantDateType;
  label: string;
  clientName: string;
  address: string;
  portalId: string | null;
  transactionId: string | null;
  agentProfileId: string | null;
  agentName: string;
  agentFubUserId: number | null;
  source: 'portal' | 'legacy';
}

export interface ImportantDateAgent {
  id: string;
  name: string;
}

const ymd = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  return value.slice(0, 10);
};

const labelForKeyDateType = (kind: string | null): ImportantDateType => {
  if (kind === 'inspection' || kind === 'appraisal') return 'inspection';
  if (kind === 'walkthrough') return 'walkthrough';
  return 'other';
};

export function useImportantDatesCalendar(year: number) {
  const { orgId } = useTenant();
  const [dates, setDates] = useState<ImportantDateEntry[]>([]);
  const [agents, setAgents] = useState<ImportantDateAgent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDates = useCallback(async () => {
    if (!orgId) {
      setDates([]);
      setAgents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [
      accountsResult,
      propertiesResult,
      transactionsResult,
      conditionsResult,
      keyDatesResult,
      legacyTransactionsResult,
      milestonesResult,
      profilesResult,
    ] = await Promise.all([
      supabase.from('client_accounts').select('id, full_name, assigned_agent_id, invited_by').eq('org_id', orgId),
      supabase.from('portal_properties').select('id, portal_id, address, city').eq('org_id', orgId),
      supabase
        .from('portal_transactions')
        .select('id, portal_id, property_id, offer_date, deposit_due_date, conditions_date, firm_date, requisition_date, closing_date, fub_deal_id')
        .eq('org_id', orgId),
      supabase
        .from('portal_transaction_conditions')
        .select('id, portal_id, transaction_id, condition_type, custom_label, due_date, status, resolved_date')
        .eq('org_id', orgId),
      supabase
        .from('portal_key_dates')
        .select('id, portal_id, transaction_id, property_id, kind, custom_label, event_date')
        .eq('org_id', orgId),
      supabase
        .from('client_transactions')
        .select('id, client_account_id, agent_id, property_address, offer_date, acceptance_date, inspection_date, appraisal_date, financing_deadline, closing_date')
        .eq('org_id', orgId),
      supabase
        .from('transaction_milestones')
        .select('id, transaction_id, title, due_date')
        .eq('org_id', orgId),
      supabase.from('profiles').select('id, full_name, fub_user_id').eq('org_id', orgId),
    ]);

    const accounts = (accountsResult.data ?? []) as any[];
    const properties = (propertiesResult.data ?? []) as any[];
    const transactions = (transactionsResult.data ?? []) as any[];
    const conditions = (conditionsResult.data ?? []) as any[];
    const keyDates = (keyDatesResult.data ?? []) as any[];
    const legacyTransactions = (legacyTransactionsResult.data ?? []) as any[];
    const milestones = (milestonesResult.data ?? []) as any[];
    const profiles = (profilesResult.data ?? []) as any[];

    const accountById = new Map(accounts.map((row) => [row.id, row]));
    const propertyById = new Map(properties.map((row) => [row.id, row]));
    const transactionById = new Map(transactions.map((row) => [row.id, row]));
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const portalProperties = new Map<string, any[]>();
    properties.forEach((property) => {
      const list = portalProperties.get(property.portal_id) ?? [];
      list.push(property);
      portalProperties.set(property.portal_id, list);
    });

    const rows: ImportantDateEntry[] = [];
    const add = (input: Omit<ImportantDateEntry, 'agentName' | 'agentFubUserId'>) => {
      const date = ymd(input.date);
      if (!date || !date.startsWith(`${year}-`)) return;
      const profile = input.agentProfileId ? profileById.get(input.agentProfileId) : null;
      rows.push({
        ...input,
        date,
        agentName: profile?.full_name || 'Unassigned',
        agentFubUserId: profile?.fub_user_id ?? null,
      });
    };
    const context = (portalId: string, transactionId?: string | null, propertyId?: string | null) => {
      const account = accountById.get(portalId);
      const transaction = transactionId ? transactionById.get(transactionId) : null;
      const property = propertyId
        ? propertyById.get(propertyId)
        : transaction?.property_id
          ? propertyById.get(transaction.property_id)
          : portalProperties.get(portalId)?.[0];
      const address = property
        ? [property.address, property.city].filter(Boolean).join(', ')
        : 'Address not set';
      return {
        clientName: account?.full_name || 'Client',
        address,
        agentProfileId: account?.assigned_agent_id || account?.invited_by || null,
      };
    };

    transactions.forEach((transaction) => {
      const base = context(transaction.portal_id, transaction.id, transaction.property_id);
      const hasIndividualConditions = conditions.some(
        (condition) => condition.transaction_id === transaction.id && condition.due_date,
      );
      const fields: Array<[string, unknown, ImportantDateType, string]> = [
        ['offer', transaction.offer_date, 'other', 'Offer / acceptance'],
        ['deposit', transaction.deposit_due_date, 'deposit', 'Deposit due'],
        ['firm', transaction.firm_date, 'condition', 'Firm date'],
        ['requisition', transaction.requisition_date, 'other', 'Requisition date'],
        ['closing', transaction.closing_date, 'closing', 'Closing / possession'],
      ];
      if (!hasIndividualConditions) {
        fields.push(['conditions', transaction.conditions_date, 'condition', 'Conditions due']);
      }
      fields.forEach(([key, date, type, label]) => add({
        id: `portal-transaction-${transaction.id}-${key}`,
        date: String(date ?? ''),
        type,
        label,
        ...base,
        portalId: transaction.portal_id,
        transactionId: transaction.id,
        source: 'portal',
      }));
    });

    conditions.forEach((condition) => {
      const base = context(condition.portal_id, condition.transaction_id);
      if (condition.due_date) add({
        id: `portal-condition-${condition.id}-due`,
        date: condition.due_date,
        type: 'condition',
        label: `${conditionLabel(condition)} deadline`,
        ...base,
        portalId: condition.portal_id,
        transactionId: condition.transaction_id,
        source: 'portal',
      });
      if (condition.resolved_date) add({
        id: `portal-condition-${condition.id}-resolved`,
        date: condition.resolved_date,
        type: 'condition',
        label: `${conditionLabel(condition)} ${condition.status === 'waived' ? 'waived' : 'resolved'}`,
        ...base,
        portalId: condition.portal_id,
        transactionId: condition.transaction_id,
        source: 'portal',
      });
    });

    keyDates.forEach((keyDate) => {
      const base = context(keyDate.portal_id, keyDate.transaction_id, keyDate.property_id);
      add({
        id: `portal-key-date-${keyDate.id}`,
        date: keyDate.event_date,
        type: labelForKeyDateType(keyDate.kind),
        label: keyDateLabel(keyDate),
        ...base,
        portalId: keyDate.portal_id,
        transactionId: keyDate.transaction_id,
        source: 'portal',
      });
    });

    legacyTransactions.forEach((transaction) => {
      const account = accountById.get(transaction.client_account_id);
      const agentProfileId = account?.assigned_agent_id || transaction.agent_id || account?.invited_by || null;
      const base = {
        clientName: account?.full_name || 'Client',
        address: transaction.property_address || 'Address not set',
        agentProfileId,
        portalId: transaction.client_account_id || null,
        transactionId: transaction.id,
        source: 'legacy' as const,
      };
      const fields: Array<[string, unknown, ImportantDateType, string]> = [
        ['offer', transaction.offer_date, 'other', 'Offer submitted'],
        ['acceptance', transaction.acceptance_date, 'other', 'Offer accepted'],
        ['inspection', transaction.inspection_date, 'inspection', 'Home inspection'],
        ['appraisal', transaction.appraisal_date, 'inspection', 'Appraisal'],
        ['financing', transaction.financing_deadline, 'condition', 'Financing deadline'],
        ['closing', transaction.closing_date, 'closing', 'Closing / possession'],
      ];
      fields.forEach(([key, date, type, label]) => add({
        id: `legacy-transaction-${transaction.id}-${key}`,
        date: String(date ?? ''),
        type,
        label,
        ...base,
      }));
      milestones
        .filter((milestone) => milestone.transaction_id === transaction.id && milestone.due_date)
        .forEach((milestone) => add({
          id: `legacy-milestone-${milestone.id}`,
          date: milestone.due_date,
          type: 'other',
          label: milestone.title || 'Important date',
          ...base,
        }));
    });

    const dateAgentIds = new Set(rows.map((row) => row.agentProfileId).filter(Boolean));
    setAgents(
      profiles
        .filter((profile) => dateAgentIds.has(profile.id))
        .map((profile) => ({ id: profile.id, name: profile.full_name || 'Agent' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setDates(rows.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label)));
    setLoading(false);
  }, [orgId, year]);

  useEffect(() => {
    void fetchDates();
  }, [fetchDates]);

  return { dates, agents, loading, refetch: fetchDates };
}