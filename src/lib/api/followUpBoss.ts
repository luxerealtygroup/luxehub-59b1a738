import { supabase } from '@/integrations/supabase/client';

export interface FUBPerson {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  emails: { value: string; type: string }[];
  phones: { value: string; type: string }[];
  stage: string;
  source: string;
  created: string;
  updated: string;
  assignedTo?: string;
  tags?: string[];
}

export interface FUBDealUser {
  id: number;
  name: string;
  picture?: {
    original?: string;
    '60x60'?: string;
    '40x40'?: string;
  };
}

export interface FUBDeal {
  id: number;
  name: string;
  stageName: string;
  pipelineName: string;
  price: number | null;
  commissionValue: number | null;
  agentCommission: number | null;
  teamCommission: number | null;
  projectedCloseDate: string | null;
  people: { id: number; name: string; avatar?: string; source?: string }[];
  users?: FUBDealUser[];
  propertyStreet?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  createdAt: string;
  status: string;
  source?: string | null;
}

export interface FUBNote {
  id: number;
  created: string;
  updated: string;
  subject: string;
  body: string;
  personId: number;
  personName?: string;
  userId: number;
  userName?: string;
}

export interface FUBCall {
  id: number;
  created: string;
  duration: number;
  direction: 'incoming' | 'outgoing';
  personId: number;
  personName?: string;
  userId: number;
  userName?: string;
  fromNumber?: string;
  toNumber?: string;
}

export interface FUBTextMessage {
  id: number;
  created: string;
  message: string;
  personId: number;
  personName?: string;
  userId: number;
  userName?: string;
  fromNumber?: string;
  toNumber?: string;
  direction?: 'incoming' | 'outgoing';
}

export interface FUBResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

export const followUpBossApi = {
  async searchPeople(query: string, limit = 20): Promise<FUBResponse<{ people: FUBPerson[] }>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'search_people', params: { query, limit } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getPeople(limit = 50, offset = 0): Promise<FUBResponse<{ people: FUBPerson[] }>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'get_people', params: { limit, offset } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getPerson(id: number): Promise<FUBResponse<FUBPerson>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'get_person', params: { id } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getDeals(limit = 50, offset = 0, stage?: string): Promise<FUBResponse<{ deals: FUBDeal[] }>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'get_deals', params: { limit, offset, stage } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getNotes(limit = 50, offset = 0, personId?: number): Promise<FUBResponse<{ notes: FUBNote[] }>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'get_notes', params: { limit, offset, personId } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async getCalls(limit = 50, offset = 0, personId?: number): Promise<FUBResponse<{ calls: FUBCall[] }>> {
    const { data, error } = await supabase.functions.invoke('follow-up-boss', {
      body: { action: 'get_calls', params: { limit, offset, personId } },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  // Note: FUB does not expose text messages via public API
};