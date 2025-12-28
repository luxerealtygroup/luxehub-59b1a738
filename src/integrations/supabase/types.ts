export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          client_name: string | null
          completed_at: string | null
          created_at: string
          deal_id: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          scheduled_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          scheduled_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_goals: {
        Row: {
          category: string
          created_at: string
          current_value: number
          end_date: string | null
          goal_type: string
          id: string
          period: string
          start_date: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          current_value?: number
          end_date?: string | null
          goal_type: string
          id?: string
          period?: string
          start_date?: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          current_value?: number
          end_date?: string | null
          goal_type?: string
          id?: string
          period?: string
          start_date?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          agent_split_percent: number | null
          amount: number
          brokerage_split_percent: number | null
          created_at: string
          deal_id: string
          gross_commission: number | null
          id: string
          other_deductions: number | null
          paid_at: string | null
          referral_amount: number | null
          status: string
          team_split_percent: number | null
          transaction_side: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_split_percent?: number | null
          amount: number
          brokerage_split_percent?: number | null
          created_at?: string
          deal_id: string
          gross_commission?: number | null
          id?: string
          other_deductions?: number | null
          paid_at?: string | null
          referral_amount?: number | null
          status?: string
          team_split_percent?: number | null
          transaction_side?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_split_percent?: number | null
          amount?: number
          brokerage_split_percent?: number | null
          created_at?: string
          deal_id?: string
          gross_commission?: number | null
          id?: string
          other_deductions?: number | null
          paid_at?: string | null
          referral_amount?: number | null
          status?: string
          team_split_percent?: number | null
          transaction_side?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_participants: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          notes: string | null
          role: string
          split_percentage: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          notes?: string | null
          role?: string
          split_percentage?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          notes?: string | null
          role?: string
          split_percentage?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_participants_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          client_name: string
          commission_rate: number | null
          company_split_percentage: number | null
          created_at: string
          deal_value: number | null
          expected_close_date: string | null
          id: string
          notes: string | null
          property_address: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          commission_rate?: number | null
          company_split_percentage?: number | null
          created_at?: string
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          property_address?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          commission_rate?: number | null
          company_split_percentage?: number | null
          created_at?: string
          deal_value?: number | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          property_address?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pipeline_clients: {
        Row: {
          client_name: string
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          property_interest: string | null
          source: string | null
          stage: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          property_interest?: string | null
          source?: string | null
          stage?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          property_interest?: string | null
          source?: string | null
          stage?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      production_goals: {
        Row: {
          annual_focus: string | null
          annual_gci_goal: number | null
          annual_units_goal: number | null
          annual_volume_goal: number | null
          created_at: string
          id: string
          monthly_goals: Json | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          annual_focus?: string | null
          annual_gci_goal?: number | null
          annual_units_goal?: number | null
          annual_volume_goal?: number | null
          created_at?: string
          id?: string
          monthly_goals?: Json | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          annual_focus?: string | null
          annual_gci_goal?: number | null
          annual_units_goal?: number | null
          annual_volume_goal?: number | null
          created_at?: string
          id?: string
          monthly_goals?: Json | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_activities: {
        Row: {
          activity_type: string
          amount: number | null
          client_name: string | null
          created_at: string
          description: string | null
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          amount?: number | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          amount?: number | null
          client_name?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_metrics: {
        Row: {
          created_at: string
          current_value: number
          id: string
          metric_name: string
          period: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          metric_name: string
          period?: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          metric_name?: string
          period?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_411: {
        Row: {
          appointments_actual: number | null
          appointments_goal: number | null
          calls_actual: number | null
          calls_goal: number | null
          challenges: string | null
          contracts_actual: number | null
          contracts_goal: number | null
          created_at: string
          id: string
          listings_actual: number | null
          listings_goal: number | null
          next_steps: string | null
          notes: string | null
          personal_priority_1: string | null
          personal_priority_1_completed: boolean | null
          personal_priority_2: string | null
          personal_priority_2_completed: boolean | null
          personal_priority_3: string | null
          personal_priority_3_completed: boolean | null
          priority_1: string | null
          priority_1_completed: boolean | null
          priority_2: string | null
          priority_2_completed: boolean | null
          priority_3: string | null
          priority_3_completed: boolean | null
          priority_4: string | null
          priority_4_completed: boolean | null
          updated_at: string
          user_id: string
          week_start_date: string
          wins: string | null
        }
        Insert: {
          appointments_actual?: number | null
          appointments_goal?: number | null
          calls_actual?: number | null
          calls_goal?: number | null
          challenges?: string | null
          contracts_actual?: number | null
          contracts_goal?: number | null
          created_at?: string
          id?: string
          listings_actual?: number | null
          listings_goal?: number | null
          next_steps?: string | null
          notes?: string | null
          personal_priority_1?: string | null
          personal_priority_1_completed?: boolean | null
          personal_priority_2?: string | null
          personal_priority_2_completed?: boolean | null
          personal_priority_3?: string | null
          personal_priority_3_completed?: boolean | null
          priority_1?: string | null
          priority_1_completed?: boolean | null
          priority_2?: string | null
          priority_2_completed?: boolean | null
          priority_3?: string | null
          priority_3_completed?: boolean | null
          priority_4?: string | null
          priority_4_completed?: boolean | null
          updated_at?: string
          user_id: string
          week_start_date: string
          wins?: string | null
        }
        Update: {
          appointments_actual?: number | null
          appointments_goal?: number | null
          calls_actual?: number | null
          calls_goal?: number | null
          challenges?: string | null
          contracts_actual?: number | null
          contracts_goal?: number | null
          created_at?: string
          id?: string
          listings_actual?: number | null
          listings_goal?: number | null
          next_steps?: string | null
          notes?: string | null
          personal_priority_1?: string | null
          personal_priority_1_completed?: boolean | null
          personal_priority_2?: string | null
          personal_priority_2_completed?: boolean | null
          personal_priority_3?: string | null
          personal_priority_3_completed?: boolean | null
          priority_1?: string | null
          priority_1_completed?: boolean | null
          priority_2?: string | null
          priority_2_completed?: boolean | null
          priority_3?: string | null
          priority_3_completed?: boolean | null
          priority_4?: string | null
          priority_4_completed?: boolean | null
          updated_at?: string
          user_id?: string
          week_start_date?: string
          wins?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      activity_type:
        | "call"
        | "appointment"
        | "showing"
        | "follow_up"
        | "email"
        | "meeting"
        | "other"
      deal_stage:
        | "lead"
        | "contacted"
        | "showing"
        | "offer"
        | "under_contract"
        | "closed"
        | "lost"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "call",
        "appointment",
        "showing",
        "follow_up",
        "email",
        "meeting",
        "other",
      ],
      deal_stage: [
        "lead",
        "contacted",
        "showing",
        "offer",
        "under_contract",
        "closed",
        "lost",
      ],
    },
  },
} as const
