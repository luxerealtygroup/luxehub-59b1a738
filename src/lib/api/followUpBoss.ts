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

export interface FUBDeal {
  id: number;
  name: string;
  stageName: string;
  pipelineName: string;
  price: number | null;
  commissionValue: number | null;
  agentCommission: number | null;
  projectedCloseDate: string | null;
  people: { id: number; name: string; avatar?: string }[];
  propertyStreet?: string | null;
  propertyCity?: string | null;
  propertyState?: string | null;
  createdAt: string;
  status: string;
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
};