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
      agent_claude_profiles: {
        Row: {
          agent_id: string
          assistant_intro: string | null
          bio: string | null
          created_at: string
          goals: Json | null
          id: string
          synced_at: string
          tasks: Json | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          assistant_intro?: string | null
          bio?: string | null
          created_at?: string
          goals?: Json | null
          id?: string
          synced_at?: string
          tasks?: Json | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          assistant_intro?: string | null
          bio?: string | null
          created_at?: string
          goals?: Json | null
          id?: string
          synced_at?: string
          tasks?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      appointment_records: {
        Row: {
          appointment_date: string
          appointment_type: string
          contact_name: string
          created_at: string
          fub_contact_id: number | null
          id: string
          notes: string | null
          outcome: string | null
          updated_at: string
          user_id: string
          week_start_date: string
          weekly_411_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_type?: string
          contact_name: string
          created_at?: string
          fub_contact_id?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id: string
          week_start_date: string
          weekly_411_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_type?: string
          contact_name?: string
          created_at?: string
          fub_contact_id?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id?: string
          week_start_date?: string
          weekly_411_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_records_weekly_411_id_fkey"
            columns: ["weekly_411_id"]
            isOneToOne: false
            referencedRelation: "weekly_411"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_settings: {
        Row: {
          created_at: string
          enabled: boolean
          field_mappings: Json
          id: string
          projects: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          field_mappings?: Json
          id?: string
          projects?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          field_mappings?: Json
          id?: string
          projects?: Json
          updated_at?: string
        }
        Relationships: []
      }
      business_planning_reflections: {
        Row: {
          biggest_bottleneck: string | null
          confidence: number | null
          created_at: string
          id: string
          quarter: number
          stress: number | null
          updated_at: string
          user_id: string
          what_avoiding: string | null
          wins_ytd: string | null
          year: number
        }
        Insert: {
          biggest_bottleneck?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          quarter: number
          stress?: number | null
          updated_at?: string
          user_id: string
          what_avoiding?: string | null
          wins_ytd?: string | null
          year?: number
        }
        Update: {
          biggest_bottleneck?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          quarter?: number
          stress?: number | null
          updated_at?: string
          user_id?: string
          what_avoiding?: string | null
          wins_ytd?: string | null
          year?: number
        }
        Relationships: []
      }
      client_accounts: {
        Row: {
          created_at: string
          email: string
          fub_person_id: number | null
          full_name: string | null
          id: string
          invited_by: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          fub_person_id?: number | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          fub_person_id?: number | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_documents: {
        Row: {
          client_name: string
          created_at: string
          deal_id: string | null
          description: string | null
          document_type: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          fub_person_id: number | null
          id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          client_name: string
          created_at?: string
          deal_id?: string | null
          description?: string | null
          document_type?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          fub_person_id?: number | null
          id?: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          client_name?: string
          created_at?: string
          deal_id?: string | null
          description?: string | null
          document_type?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          fub_person_id?: number | null
          id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      client_messages: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          message: string
          read_at: string | null
          sender_id: string
          sender_type: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          sender_id: string
          sender_type: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          assigned_by: string
          client_account_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          title: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_by: string
          client_account_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          title: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          client_account_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          title?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "client_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_transactions: {
        Row: {
          acceptance_date: string | null
          agent_id: string
          appraisal_date: string | null
          client_account_id: string
          closing_date: string | null
          created_at: string
          deal_id: string | null
          financing_deadline: string | null
          id: string
          inspection_date: string | null
          list_price: number | null
          offer_date: string | null
          property_address: string
          property_description: string | null
          property_photos: Json | null
          sale_price: number | null
          status: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          acceptance_date?: string | null
          agent_id: string
          appraisal_date?: string | null
          client_account_id: string
          closing_date?: string | null
          created_at?: string
          deal_id?: string | null
          financing_deadline?: string | null
          id?: string
          inspection_date?: string | null
          list_price?: number | null
          offer_date?: string | null
          property_address: string
          property_description?: string | null
          property_photos?: Json | null
          sale_price?: number | null
          status?: string
          transaction_type?: string
          updated_at?: string
        }
        Update: {
          acceptance_date?: string | null
          agent_id?: string
          appraisal_date?: string | null
          client_account_id?: string
          closing_date?: string | null
          created_at?: string
          deal_id?: string | null
          financing_deadline?: string | null
          id?: string
          inspection_date?: string | null
          list_price?: number | null
          offer_date?: string | null
          property_address?: string
          property_description?: string | null
          property_photos?: Json | null
          sale_price?: number | null
          status?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_transactions_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_transactions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      cma_import_logs: {
        Row: {
          cma_report_id: string | null
          cma_source_url: string | null
          comps_imported: number
          comps_partial: number
          comps_skipped: number
          created_at: string
          estimated_page_count: number | null
          extraction_duration_ms: number | null
          extraction_passes: number
          file_name: string | null
          file_size_bytes: number | null
          id: string
          raw_text_length: number | null
          skip_reasons: Json
          source_type: string | null
          total_blocks_detected: number
          user_id: string
        }
        Insert: {
          cma_report_id?: string | null
          cma_source_url?: string | null
          comps_imported?: number
          comps_partial?: number
          comps_skipped?: number
          created_at?: string
          estimated_page_count?: number | null
          extraction_duration_ms?: number | null
          extraction_passes?: number
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          raw_text_length?: number | null
          skip_reasons?: Json
          source_type?: string | null
          total_blocks_detected?: number
          user_id: string
        }
        Update: {
          cma_report_id?: string | null
          cma_source_url?: string | null
          comps_imported?: number
          comps_partial?: number
          comps_skipped?: number
          created_at?: string
          estimated_page_count?: number | null
          extraction_duration_ms?: number | null
          extraction_passes?: number
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          raw_text_length?: number | null
          skip_reasons?: Json
          source_type?: string | null
          total_blocks_detected?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cma_import_logs_cma_report_id_fkey"
            columns: ["cma_report_id"]
            isOneToOne: false
            referencedRelation: "cma_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      cma_reports: {
        Row: {
          active_listings: number | null
          adjustment_observations: Json | null
          ai_raw_response: Json | null
          analysis_status: string | null
          approval_status: string
          approved_executive_summary: string | null
          approved_market_conditions: string | null
          approved_objections: string | null
          approved_price_narrative: string | null
          approved_risk_flags: string | null
          approved_strategy: string | null
          approved_talking_points: string | null
          approx_sqft: number | null
          avg_days_on_market: number | null
          bathrooms: number | null
          bedrooms: number | null
          city_area: string
          cma_grade: string | null
          cma_pdf_name: string | null
          cma_pdf_path: string | null
          cma_source_url: string | null
          cover_photo_index: number | null
          created_at: string
          equity_gain_high: number | null
          equity_gain_low: number | null
          equity_recalc_count: number
          extracted_comps: Json | null
          final_list_price: number | null
          final_sold_price: number | null
          fub_automation_log: Json
          fub_person_id: number | null
          fub_person_name: string | null
          id: string
          improvements_invested: number | null
          improvements_list: Json
          intended_list_date: string | null
          last_edited_by: string | null
          last_equity_update: string | null
          lifecycle_history: Json
          listing_active_at: string | null
          listing_signed_at: string | null
          listing_sold_at: string | null
          listing_status: string
          lost_reason: string | null
          market_narrative: string | null
          market_notes: string | null
          market_shift_detected: boolean
          median_sale_price: number | null
          months_of_inventory: number | null
          prev_avg_days_on_market: number | null
          prev_median_sale_price: number | null
          pricing_band_high: number | null
          pricing_band_low: number | null
          pricing_band_recommended: number | null
          pricing_confidence: string | null
          property_address: string
          property_type: string
          purchase_date: string
          purchase_price: number
          risk_flags: Json | null
          sale_to_list_ratio: number | null
          seller_objections: Json | null
          sold_listings: number | null
          stats_date_range: string | null
          stats_method: string | null
          stats_pasted_text: string | null
          stats_pdf_path: string | null
          strategy_recommendation: string | null
          subject_photos: Json | null
          talking_points: Json | null
          target_list_price: number | null
          updated_at: string
          user_id: string
          version_number: number
          weak_comp_alerts: Json | null
        }
        Insert: {
          active_listings?: number | null
          adjustment_observations?: Json | null
          ai_raw_response?: Json | null
          analysis_status?: string | null
          approval_status?: string
          approved_executive_summary?: string | null
          approved_market_conditions?: string | null
          approved_objections?: string | null
          approved_price_narrative?: string | null
          approved_risk_flags?: string | null
          approved_strategy?: string | null
          approved_talking_points?: string | null
          approx_sqft?: number | null
          avg_days_on_market?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city_area: string
          cma_grade?: string | null
          cma_pdf_name?: string | null
          cma_pdf_path?: string | null
          cma_source_url?: string | null
          cover_photo_index?: number | null
          created_at?: string
          equity_gain_high?: number | null
          equity_gain_low?: number | null
          equity_recalc_count?: number
          extracted_comps?: Json | null
          final_list_price?: number | null
          final_sold_price?: number | null
          fub_automation_log?: Json
          fub_person_id?: number | null
          fub_person_name?: string | null
          id?: string
          improvements_invested?: number | null
          improvements_list?: Json
          intended_list_date?: string | null
          last_edited_by?: string | null
          last_equity_update?: string | null
          lifecycle_history?: Json
          listing_active_at?: string | null
          listing_signed_at?: string | null
          listing_sold_at?: string | null
          listing_status?: string
          lost_reason?: string | null
          market_narrative?: string | null
          market_notes?: string | null
          market_shift_detected?: boolean
          median_sale_price?: number | null
          months_of_inventory?: number | null
          prev_avg_days_on_market?: number | null
          prev_median_sale_price?: number | null
          pricing_band_high?: number | null
          pricing_band_low?: number | null
          pricing_band_recommended?: number | null
          pricing_confidence?: string | null
          property_address: string
          property_type?: string
          purchase_date: string
          purchase_price: number
          risk_flags?: Json | null
          sale_to_list_ratio?: number | null
          seller_objections?: Json | null
          sold_listings?: number | null
          stats_date_range?: string | null
          stats_method?: string | null
          stats_pasted_text?: string | null
          stats_pdf_path?: string | null
          strategy_recommendation?: string | null
          subject_photos?: Json | null
          talking_points?: Json | null
          target_list_price?: number | null
          updated_at?: string
          user_id: string
          version_number?: number
          weak_comp_alerts?: Json | null
        }
        Update: {
          active_listings?: number | null
          adjustment_observations?: Json | null
          ai_raw_response?: Json | null
          analysis_status?: string | null
          approval_status?: string
          approved_executive_summary?: string | null
          approved_market_conditions?: string | null
          approved_objections?: string | null
          approved_price_narrative?: string | null
          approved_risk_flags?: string | null
          approved_strategy?: string | null
          approved_talking_points?: string | null
          approx_sqft?: number | null
          avg_days_on_market?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          city_area?: string
          cma_grade?: string | null
          cma_pdf_name?: string | null
          cma_pdf_path?: string | null
          cma_source_url?: string | null
          cover_photo_index?: number | null
          created_at?: string
          equity_gain_high?: number | null
          equity_gain_low?: number | null
          equity_recalc_count?: number
          extracted_comps?: Json | null
          final_list_price?: number | null
          final_sold_price?: number | null
          fub_automation_log?: Json
          fub_person_id?: number | null
          fub_person_name?: string | null
          id?: string
          improvements_invested?: number | null
          improvements_list?: Json
          intended_list_date?: string | null
          last_edited_by?: string | null
          last_equity_update?: string | null
          lifecycle_history?: Json
          listing_active_at?: string | null
          listing_signed_at?: string | null
          listing_sold_at?: string | null
          listing_status?: string
          lost_reason?: string | null
          market_narrative?: string | null
          market_notes?: string | null
          market_shift_detected?: boolean
          median_sale_price?: number | null
          months_of_inventory?: number | null
          prev_avg_days_on_market?: number | null
          prev_median_sale_price?: number | null
          pricing_band_high?: number | null
          pricing_band_low?: number | null
          pricing_band_recommended?: number | null
          pricing_confidence?: string | null
          property_address?: string
          property_type?: string
          purchase_date?: string
          purchase_price?: number
          risk_flags?: Json | null
          sale_to_list_ratio?: number | null
          seller_objections?: Json | null
          sold_listings?: number | null
          stats_date_range?: string | null
          stats_method?: string | null
          stats_pasted_text?: string | null
          stats_pdf_path?: string | null
          strategy_recommendation?: string | null
          subject_photos?: Json | null
          talking_points?: Json | null
          target_list_price?: number | null
          updated_at?: string
          user_id?: string
          version_number?: number
          weak_comp_alerts?: Json | null
        }
        Relationships: []
      }
      commissions: {
        Row: {
          agent_split_percent: number | null
          amount: number
          brokerage_split_percent: number | null
          condition_deadline: string | null
          condition_notes: string | null
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
          condition_deadline?: string | null
          condition_notes?: string | null
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
          condition_deadline?: string | null
          condition_notes?: string | null
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
      company_budget_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          id: string
          is_recurring: boolean
          month: number
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          created_by: string
          id?: string
          is_recurring?: boolean
          month: number
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          is_recurring?: boolean
          month?: number
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      company_goals: {
        Row: {
          annual_deals_goal: number | null
          annual_gci_goal: number | null
          annual_revenue_goal: number | null
          annual_volume_goal: number | null
          created_at: string
          created_by: string
          id: string
          monthly_goals: Json | null
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          annual_deals_goal?: number | null
          annual_gci_goal?: number | null
          annual_revenue_goal?: number | null
          annual_volume_goal?: number | null
          created_at?: string
          created_by: string
          id?: string
          monthly_goals?: Json | null
          notes?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          annual_deals_goal?: number | null
          annual_gci_goal?: number | null
          annual_revenue_goal?: number | null
          annual_volume_goal?: number | null
          created_at?: string
          created_by?: string
          id?: string
          monthly_goals?: Json | null
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      deal_metadata: {
        Row: {
          created_at: string
          deal_category: string
          fub_deal_id: number
          id: string
          updated_at: string
          updated_by: string | null
          weight_override: number | null
        }
        Insert: {
          created_at?: string
          deal_category?: string
          fub_deal_id: number
          id?: string
          updated_at?: string
          updated_by?: string | null
          weight_override?: number | null
        }
        Update: {
          created_at?: string
          deal_category?: string
          fub_deal_id?: number
          id?: string
          updated_at?: string
          updated_by?: string | null
          weight_override?: number | null
        }
        Relationships: []
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
      deal_source_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      deal_source_targets: {
        Row: {
          created_at: string
          created_by: string
          id: string
          source_category: string
          target_percentage: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          source_category: string
          target_percentage?: number
          updated_at?: string
          year?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          source_category?: string
          target_percentage?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      deal_sources: {
        Row: {
          agent_id: string
          close_date: string | null
          created_at: string
          deal_address: string | null
          deal_type: string
          fub_deal_id: number | null
          gci: number | null
          id: string
          source_category: string
          source_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          close_date?: string | null
          created_at?: string
          deal_address?: string | null
          deal_type?: string
          fub_deal_id?: number | null
          gci?: number | null
          id?: string
          source_category: string
          source_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          close_date?: string | null
          created_at?: string
          deal_address?: string | null
          deal_type?: string
          fub_deal_id?: number | null
          gci?: number | null
          id?: string
          source_category?: string
          source_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
          source: string | null
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
          source?: string | null
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
          source?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      important_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      manual_production: {
        Row: {
          closed_deals: number
          created_at: string
          database_size: number
          gci_closed: number
          gci_pending: number
          id: string
          month: number
          notes: string | null
          pending_deals: number
          pipeline_count: number
          total_volume: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          closed_deals?: number
          created_at?: string
          database_size?: number
          gci_closed?: number
          gci_pending?: number
          id?: string
          month?: number
          notes?: string | null
          pending_deals?: number
          pipeline_count?: number
          total_volume?: number
          updated_at?: string
          user_id: string
          year?: number
        }
        Update: {
          closed_deals?: number
          created_at?: string
          database_size?: number
          gci_closed?: number
          gci_pending?: number
          id?: string
          month?: number
          notes?: string | null
          pending_deals?: number
          pipeline_count?: number
          total_volume?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      pipeline_clients: {
        Row: {
          client_name: string
          client_type: string
          created_at: string
          deal_category: string
          email: string | null
          expected_pending_date: string | null
          id: string
          notes: string | null
          phone: string | null
          projected_gci: number | null
          projected_sale_amount: number | null
          property_interest: string | null
          source: string | null
          stage: number
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_name: string
          client_type?: string
          created_at?: string
          deal_category?: string
          email?: string | null
          expected_pending_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          projected_gci?: number | null
          projected_sale_amount?: number | null
          property_interest?: string | null
          source?: string | null
          stage?: number
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_name?: string
          client_type?: string
          created_at?: string
          deal_category?: string
          email?: string | null
          expected_pending_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          projected_gci?: number | null
          projected_sale_amount?: number | null
          property_interest?: string | null
          source?: string | null
          stage?: number
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      planning_assumptions: {
        Row: {
          appt_to_contract_rate: number
          avg_commission: number
          avg_sale_price: number
          cma_to_listing_rate: number
          contact_to_appt_rate: number
          created_at: string
          dials_to_appt_rate: number
          gci_target: number
          id: string
          quarter: number
          split_percent: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          appt_to_contract_rate?: number
          avg_commission?: number
          avg_sale_price?: number
          cma_to_listing_rate?: number
          contact_to_appt_rate?: number
          created_at?: string
          dials_to_appt_rate?: number
          gci_target?: number
          id?: string
          quarter?: number
          split_percent?: number
          updated_at?: string
          user_id: string
          year?: number
        }
        Update: {
          appt_to_contract_rate?: number
          avg_commission?: number
          avg_sale_price?: number
          cma_to_listing_rate?: number
          contact_to_appt_rate?: number
          created_at?: string
          dials_to_appt_rate?: number
          gci_target?: number
          id?: string
          quarter?: number
          split_percent?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      planning_reflections: {
        Row: {
          avoided_activity: string | null
          best_lead_source: string | null
          created_at: string
          id: string
          negative_habits: string | null
          quarter: number
          single_improvement: string | null
          updated_at: string
          user_id: string
          what_didnt_work: string | null
          what_worked: string | null
          year: number
        }
        Insert: {
          avoided_activity?: string | null
          best_lead_source?: string | null
          created_at?: string
          id?: string
          negative_habits?: string | null
          quarter: number
          single_improvement?: string | null
          updated_at?: string
          user_id: string
          what_didnt_work?: string | null
          what_worked?: string | null
          year?: number
        }
        Update: {
          avoided_activity?: string | null
          best_lead_source?: string | null
          created_at?: string
          id?: string
          negative_habits?: string | null
          quarter?: number
          single_improvement?: string | null
          updated_at?: string
          user_id?: string
          what_didnt_work?: string | null
          what_worked?: string | null
          year?: number
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
          access_expires_at: string | null
          avatar_url: string | null
          created_at: string
          fub_user_id: number | null
          full_name: string | null
          id: string
          is_demo_account: boolean
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string
          fub_user_id?: number | null
          full_name?: string | null
          id: string
          is_demo_account?: boolean
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          avatar_url?: string | null
          created_at?: string
          fub_user_id?: number | null
          full_name?: string | null
          id?: string
          is_demo_account?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      recruiting_pipeline: {
        Row: {
          accepted: number
          avg_agent_production: number
          created_at: string
          created_by: string
          id: string
          interviews: number
          notes: string | null
          offers: number
          quarter: number
          recruiting_leads: number
          updated_at: string
          year: number
        }
        Insert: {
          accepted?: number
          avg_agent_production?: number
          created_at?: string
          created_by: string
          id?: string
          interviews?: number
          notes?: string | null
          offers?: number
          quarter?: number
          recruiting_leads?: number
          updated_at?: string
          year?: number
        }
        Update: {
          accepted?: number
          avg_agent_production?: number
          created_at?: string
          created_by?: string
          id?: string
          interviews?: number
          notes?: string | null
          offers?: number
          quarter?: number
          recruiting_leads?: number
          updated_at?: string
          year?: number
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
      submissions: {
        Row: {
          agent_name: string | null
          attachments: Json | null
          bra_reco_files: Json | null
          buyer_emails: string | null
          buyer_names: string | null
          buyer_phones: string | null
          client_name: string | null
          client_occupation: string | null
          closing_date: string | null
          condition_due_financing: string | null
          condition_due_home_inspection: string | null
          condition_due_other: string | null
          condition_due_sbp: string | null
          condition_due_status: string | null
          condition_other_description: string | null
          conditional_price: number | null
          cooperating_commission: string | null
          created_at: string
          door_knockers: boolean | null
          door_knockers_needed: string | null
          door_knockers_quantity: string | null
          feature_sheets: boolean | null
          feature_sheets_needed: string | null
          fintracker_files: Json | null
          firm_price: number | null
          form_type: string
          id: string
          ids_files: Json | null
          invoice_amount: number | null
          invoice_date: string | null
          invoice_file_path: string | null
          lender_name_contact: string | null
          list_price: number | null
          listing_date: string | null
          listing_notes: string | null
          notes: string | null
          occupancy: string | null
          open_house_date: string | null
          open_house_time: string | null
          other_docs_files: Json | null
          photography_package: string | null
          property_address: string | null
          purchase_price: number | null
          second_date: string | null
          second_time: string | null
          seller_emails: string | null
          seller_names: string | null
          seller_phones: string | null
          staging_consult: boolean | null
          status: string
          submission_type: string | null
          updated_at: string
          user_id: string
          vendor_name: string | null
          vendor_type: string | null
        }
        Insert: {
          agent_name?: string | null
          attachments?: Json | null
          bra_reco_files?: Json | null
          buyer_emails?: string | null
          buyer_names?: string | null
          buyer_phones?: string | null
          client_name?: string | null
          client_occupation?: string | null
          closing_date?: string | null
          condition_due_financing?: string | null
          condition_due_home_inspection?: string | null
          condition_due_other?: string | null
          condition_due_sbp?: string | null
          condition_due_status?: string | null
          condition_other_description?: string | null
          conditional_price?: number | null
          cooperating_commission?: string | null
          created_at?: string
          door_knockers?: boolean | null
          door_knockers_needed?: string | null
          door_knockers_quantity?: string | null
          feature_sheets?: boolean | null
          feature_sheets_needed?: string | null
          fintracker_files?: Json | null
          firm_price?: number | null
          form_type: string
          id?: string
          ids_files?: Json | null
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_file_path?: string | null
          lender_name_contact?: string | null
          list_price?: number | null
          listing_date?: string | null
          listing_notes?: string | null
          notes?: string | null
          occupancy?: string | null
          open_house_date?: string | null
          open_house_time?: string | null
          other_docs_files?: Json | null
          photography_package?: string | null
          property_address?: string | null
          purchase_price?: number | null
          second_date?: string | null
          second_time?: string | null
          seller_emails?: string | null
          seller_names?: string | null
          seller_phones?: string | null
          staging_consult?: boolean | null
          status?: string
          submission_type?: string | null
          updated_at?: string
          user_id: string
          vendor_name?: string | null
          vendor_type?: string | null
        }
        Update: {
          agent_name?: string | null
          attachments?: Json | null
          bra_reco_files?: Json | null
          buyer_emails?: string | null
          buyer_names?: string | null
          buyer_phones?: string | null
          client_name?: string | null
          client_occupation?: string | null
          closing_date?: string | null
          condition_due_financing?: string | null
          condition_due_home_inspection?: string | null
          condition_due_other?: string | null
          condition_due_sbp?: string | null
          condition_due_status?: string | null
          condition_other_description?: string | null
          conditional_price?: number | null
          cooperating_commission?: string | null
          created_at?: string
          door_knockers?: boolean | null
          door_knockers_needed?: string | null
          door_knockers_quantity?: string | null
          feature_sheets?: boolean | null
          feature_sheets_needed?: string | null
          fintracker_files?: Json | null
          firm_price?: number | null
          form_type?: string
          id?: string
          ids_files?: Json | null
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_file_path?: string | null
          lender_name_contact?: string | null
          list_price?: number | null
          listing_date?: string | null
          listing_notes?: string | null
          notes?: string | null
          occupancy?: string | null
          open_house_date?: string | null
          open_house_time?: string | null
          other_docs_files?: Json | null
          photography_package?: string | null
          property_address?: string | null
          purchase_price?: number | null
          second_date?: string | null
          second_time?: string | null
          seller_emails?: string | null
          seller_names?: string | null
          seller_phones?: string | null
          staging_consult?: boolean | null
          status?: string
          submission_type?: string | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
          vendor_type?: string | null
        }
        Relationships: []
      }
      training_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      transaction_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          sort_order: number | null
          status: string
          title: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          sort_order?: number | null
          status?: string
          title: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          sort_order?: number | null
          status?: string
          title?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_milestones_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "client_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weekly_411: {
        Row: {
          appointments_actual: number | null
          appointments_goal: number | null
          appointments_held: number | null
          appointments_set: number | null
          calls_actual: number | null
          calls_goal: number | null
          challenges: string | null
          contacts_made: number | null
          contracts_actual: number | null
          contracts_goal: number | null
          contracts_signed: number | null
          created_at: string
          database_size: number | null
          dials: number | null
          doors_knocked: number | null
          firm_deals: number | null
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
          pipeline_additions: number | null
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
          appointments_held?: number | null
          appointments_set?: number | null
          calls_actual?: number | null
          calls_goal?: number | null
          challenges?: string | null
          contacts_made?: number | null
          contracts_actual?: number | null
          contracts_goal?: number | null
          contracts_signed?: number | null
          created_at?: string
          database_size?: number | null
          dials?: number | null
          doors_knocked?: number | null
          firm_deals?: number | null
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
          pipeline_additions?: number | null
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
          appointments_held?: number | null
          appointments_set?: number | null
          calls_actual?: number | null
          calls_goal?: number | null
          challenges?: string | null
          contacts_made?: number | null
          contracts_actual?: number | null
          contracts_goal?: number | null
          contracts_signed?: number | null
          created_at?: string
          database_size?: number | null
          dials?: number | null
          doors_knocked?: number | null
          firm_deals?: number | null
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
          pipeline_additions?: number | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_cma_version: { Args: { report_id: string }; Returns: undefined }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      is_client: { Args: { _user_id: string }; Returns: boolean }
      is_demo_account: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
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
      app_role: "owner" | "admin" | "agent" | "planning_access"
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
      app_role: ["owner", "admin", "agent", "planning_access"],
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
