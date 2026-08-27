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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_name: string | null
          event_type: string | null
          id: string
          metadata: Json | null
          path: string | null
          project_id: string | null
          props: Json
          referrer: string | null
          session_id: string | null
          template_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          path?: string | null
          project_id?: string | null
          props?: Json
          referrer?: string | null
          session_id?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string | null
          event_type?: string | null
          id?: string
          metadata?: Json | null
          path?: string | null
          project_id?: string | null
          props?: Json
          referrer?: string | null
          session_id?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cinema_batch_config: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          token: string
          updated_at: string
          usd_ceiling: number
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          token: string
          updated_at?: string
          usd_ceiling?: number
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          token?: string
          updated_at?: string
          usd_ceiling?: number
        }
        Relationships: []
      }
      cinema_batch_queue: {
        Row: {
          attempts: number
          category: string
          created_at: string
          error: string | null
          generated_src: string | null
          id: string
          kind: string
          name: string | null
          preset_id: string
          scene: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          category: string
          created_at?: string
          error?: string | null
          generated_src?: string | null
          id?: string
          kind?: string
          name?: string | null
          preset_id: string
          scene?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          category?: string
          created_at?: string
          error?: string | null
          generated_src?: string | null
          id?: string
          kind?: string
          name?: string | null
          preset_id?: string
          scene?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cinema_batch_spend: {
        Row: {
          created_at: string
          id: string
          kind: string
          preset_id: string
          usd: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          preset_id: string
          usd?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          preset_id?: string
          usd?: number
        }
        Relationships: []
      }
      cinema_control_tests: {
        Row: {
          category: string
          consistency_score: number | null
          created_at: string
          difference_score: number | null
          evaluator_notes: string | null
          id: string
          model: string
          outputs: Json
          preset_id: string
          promotion: string | null
          support_type: string | null
          test_date: string
          user_id: string
          variable_a: string
          variable_b: string
        }
        Insert: {
          category: string
          consistency_score?: number | null
          created_at?: string
          difference_score?: number | null
          evaluator_notes?: string | null
          id?: string
          model: string
          outputs?: Json
          preset_id: string
          promotion?: string | null
          support_type?: string | null
          test_date?: string
          user_id: string
          variable_a: string
          variable_b: string
        }
        Update: {
          category?: string
          consistency_score?: number | null
          created_at?: string
          difference_score?: number | null
          evaluator_notes?: string | null
          id?: string
          model?: string
          outputs?: Json
          preset_id?: string
          promotion?: string | null
          support_type?: string | null
          test_date?: string
          user_id?: string
          variable_a?: string
          variable_b?: string
        }
        Relationships: []
      }
      cinema_presets: {
        Row: {
          builtin: boolean
          category: string
          config: Json
          created_at: string
          id: string
          name: string
          tags: string[]
          thumbnail: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          builtin?: boolean
          category?: string
          config?: Json
          created_at?: string
          id?: string
          name: string
          tags?: string[]
          thumbnail?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          builtin?: boolean
          category?: string
          config?: Json
          created_at?: string
          id?: string
          name?: string
          tags?: string[]
          thumbnail?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cinema_preview_assets: {
        Row: {
          category: string
          created_at: string
          id: string
          kind: string
          poster: string | null
          preset_id: string
          sources: Json
          src: string | null
          swatches: string[]
          thumb_src: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          kind?: string
          poster?: string | null
          preset_id: string
          sources?: Json
          src?: string | null
          swatches?: string[]
          thumb_src?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          kind?: string
          poster?: string | null
          preset_id?: string
          sources?: Json
          src?: string | null
          swatches?: string[]
          thumb_src?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      cinema_projects: {
        Row: {
          created_at: string
          id: string
          name: string
          project_state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          project_state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contests: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          prize: string | null
          sort_order: number
          starts_at: string | null
          status: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          prize?: string | null
          sort_order?: number
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          prize?: string | null
          sort_order?: number
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_profiles: {
        Row: {
          accent: string
          avatar_url: string | null
          banner_url: string | null
          bio: string | null
          created_at: string
          description: string | null
          display_name: string
          handle: string
          id: string
          instagram: string | null
          is_public: boolean
          location: string | null
          portfolio_url: string | null
          specialties: string[]
          tiktok: string | null
          updated_at: string
          user_id: string
          website: string | null
          x_handle: string | null
        }
        Insert: {
          accent?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          handle: string
          id?: string
          instagram?: string | null
          is_public?: boolean
          location?: string | null
          portfolio_url?: string | null
          specialties?: string[]
          tiktok?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          x_handle?: string | null
        }
        Update: {
          accent?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string | null
          created_at?: string
          description?: string | null
          display_name?: string
          handle?: string
          id?: string
          instagram?: string | null
          is_public?: boolean
          location?: string | null
          portfolio_url?: string | null
          specialties?: string[]
          tiktok?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          x_handle?: string | null
        }
        Relationships: []
      }
      creators: {
        Row: {
          connect_status: string
          created_at: string
          display_name: string
          id: string
          stripe_connect_account_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connect_status?: string
          created_at?: string
          display_name: string
          id?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connect_status?: string
          created_at?: string
          display_name?: string
          id?: string
          stripe_connect_account_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          project_id: string | null
          step_id: string | null
          template_id: string | null
          type: Database["public"]["Enums"]["credit_event_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string | null
          step_id?: string | null
          template_id?: string | null
          type: Database["public"]["Enums"]["credit_event_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          project_id?: string | null
          step_id?: string | null
          template_id?: string | null
          type?: Database["public"]["Enums"]["credit_event_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "project_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      jewelry_knowledge_base: {
        Row: {
          aliases: string[]
          canonical_name: string
          confidence: number | null
          created_at: string
          definition: string | null
          engineering_signature: Json
          id: string
          source_urls: string[]
          term_key: string
          updated_at: string
          vocabulary_domain: string | null
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          confidence?: number | null
          created_at?: string
          definition?: string | null
          engineering_signature?: Json
          id?: string
          source_urls?: string[]
          term_key: string
          updated_at?: string
          vocabulary_domain?: string | null
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          confidence?: number | null
          created_at?: string
          definition?: string | null
          engineering_signature?: Json
          id?: string
          source_urls?: string[]
          term_key?: string
          updated_at?: string
          vocabulary_domain?: string | null
        }
        Relationships: []
      }
      jewelry_still_analyses: {
        Row: {
          analysis: Json
          analyzed_at: string
          fingerprint: string
          id: string
          user_id: string
          version: string
        }
        Insert: {
          analysis: Json
          analyzed_at?: string
          fingerprint: string
          id?: string
          user_id: string
          version?: string
        }
        Update: {
          analysis?: Json
          analyzed_at?: string
          fingerprint?: string
          id?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      jewelry_swap_projects: {
        Row: {
          created_at: string
          id: string
          name: string | null
          project_state: Json | null
          source_video_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          project_state?: Json | null
          source_video_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          project_state?: Json | null
          source_video_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      node_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_log: string | null
          estimated_cost_usd: number | null
          estimated_credits: number | null
          id: string
          input_payload: Json
          node_id: string
          output_type: string | null
          output_url: string | null
          provider: string | null
          provider_model: string | null
          provider_request_id: string | null
          status: string
          updated_at: string
          user_id: string
          version_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          estimated_cost_usd?: number | null
          estimated_credits?: number | null
          id?: string
          input_payload?: Json
          node_id: string
          output_type?: string | null
          output_url?: string | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          estimated_cost_usd?: number | null
          estimated_credits?: number | null
          id?: string
          input_payload?: Json
          node_id?: string
          output_type?: string | null
          output_url?: string | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount_cents: number
          beneficiary_id: string
          beneficiary_type: string
          created_at: string
          id: string
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents?: number
          beneficiary_id: string
          beneficiary_type: string
          created_at?: string
          id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          beneficiary_id?: string
          beneficiary_type?: string
          created_at?: string
          id?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          affiliate_percent_of_platform: number
          creator_share_percent: number
          hold_period_days: number
          id: string
          platform_share_percent: number
          updated_at: string
        }
        Insert: {
          affiliate_percent_of_platform?: number
          creator_share_percent?: number
          hold_period_days?: number
          id?: string
          platform_share_percent?: number
          updated_at?: string
        }
        Update: {
          affiliate_percent_of_platform?: number
          creator_share_percent?: number
          hold_period_days?: number
          id?: string
          platform_share_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits_balance: number
          email: string
          id: string
          name: string | null
          plan: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number
          email: string
          id?: string
          name?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number
          email?: string
          id?: string
          name?: string | null
          plan?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          last_run_cost_credits: number | null
          output_url: string | null
          project_id: string
          status: Database["public"]["Enums"]["step_status"]
          step_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          last_run_cost_credits?: number | null
          output_url?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["step_status"]
          step_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          last_run_cost_credits?: number | null
          output_url?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["step_status"]
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_steps_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          debug_trace: Json | null
          error: string | null
          failed_at: string | null
          failed_source: string | null
          id: string
          inputs: Json | null
          logs: Json
          max_attempts: number
          outputs: Json | null
          progress: number
          started_at: string | null
          status: Database["public"]["Enums"]["project_status"]
          template_id: string | null
          template_name: string | null
          updated_at: string
          user_id: string | null
          user_inputs: Json | null
          weavy_run_id: string | null
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          debug_trace?: Json | null
          error?: string | null
          failed_at?: string | null
          failed_source?: string | null
          id?: string
          inputs?: Json | null
          logs?: Json
          max_attempts?: number
          outputs?: Json | null
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
          user_inputs?: Json | null
          weavy_run_id?: string | null
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          debug_trace?: Json | null
          error?: string | null
          failed_at?: string | null
          failed_source?: string | null
          id?: string
          inputs?: Json | null
          logs?: Json
          max_attempts?: number
          outputs?: Json | null
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          template_id?: string | null
          template_name?: string | null
          updated_at?: string
          user_id?: string | null
          user_inputs?: Json | null
          weavy_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_attributions: {
        Row: {
          attributed_at: string
          code_used: string
          id: string
          qualified_at: string | null
          referred_user_id: string
          referrer_user_id: string
          rewarded_at: string | null
          status: string
        }
        Insert: {
          attributed_at?: string
          code_used: string
          id?: string
          qualified_at?: string | null
          referred_user_id: string
          referrer_user_id: string
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          attributed_at?: string
          code_used?: string
          id?: string
          qualified_at?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          rewarded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          owner_user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          owner_user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      referral_program_config: {
        Row: {
          affiliate_percent_of_platform_share: number | null
          enabled: boolean
          id: string
          paid_trigger: string
          referrer_bonus_credits_on_paid: number
          signup_bonus_credits: number
          updated_at: string
        }
        Insert: {
          affiliate_percent_of_platform_share?: number | null
          enabled?: boolean
          id?: string
          paid_trigger?: string
          referrer_bonus_credits_on_paid?: number
          signup_bonus_credits?: number
          updated_at?: string
        }
        Update: {
          affiliate_percent_of_platform_share?: number | null
          enabled?: boolean
          id?: string
          paid_trigger?: string
          referrer_bonus_credits_on_paid?: number
          signup_bonus_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          attribution_id: string | null
          created_at: string
          credits_amount: number | null
          id: string
          referred_user_id: string
          referrer_user_id: string
          revenue_allocation_id: string | null
          reward_type: string
          stripe_event_id: string | null
        }
        Insert: {
          attribution_id?: string | null
          created_at?: string
          credits_amount?: number | null
          id?: string
          referred_user_id: string
          referrer_user_id: string
          revenue_allocation_id?: string | null
          reward_type: string
          stripe_event_id?: string | null
        }
        Update: {
          attribution_id?: string | null
          created_at?: string
          credits_amount?: number | null
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
          revenue_allocation_id?: string | null
          reward_type?: string
          stripe_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_attribution_id_fkey"
            columns: ["attribution_id"]
            isOneToOne: false
            referencedRelation: "referral_attributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_revenue_allocation_id_fkey"
            columns: ["revenue_allocation_id"]
            isOneToOne: false
            referencedRelation: "revenue_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_events: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          reason: string | null
          stripe_charge_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          reason?: string | null
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          reason?: string | null
          stripe_charge_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: []
      }
      revenue_allocations: {
        Row: {
          amount_cents: number
          available_at: string | null
          beneficiary_id: string | null
          beneficiary_type: string
          created_at: string
          id: string
          payout_id: string | null
          status: string
          usage_charge_id: string
        }
        Insert: {
          amount_cents?: number
          available_at?: string | null
          beneficiary_id?: string | null
          beneficiary_type: string
          created_at?: string
          id?: string
          payout_id?: string | null
          status?: string
          usage_charge_id: string
        }
        Update: {
          amount_cents?: number
          available_at?: string | null
          beneficiary_id?: string | null
          beneficiary_type?: string
          created_at?: string
          id?: string
          payout_id?: string | null
          status?: string
          usage_charge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_allocations_usage_charge_id_fkey"
            columns: ["usage_charge_id"]
            isOneToOne: false
            referencedRelation: "usage_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      streetwear_references: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          notes: string | null
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_generations: {
        Row: {
          completed_at: string | null
          created_at: string
          error_log: string | null
          estimated_cost_usd: number | null
          estimated_credits: number | null
          favorited: boolean
          id: string
          input_payload: Json
          kind: string
          output_type: string | null
          output_url: string | null
          prompt: string | null
          provider: string | null
          provider_model: string | null
          provider_request_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          estimated_cost_usd?: number | null
          estimated_credits?: number | null
          favorited?: boolean
          id?: string
          input_payload?: Json
          kind?: string
          output_type?: string | null
          output_url?: string | null
          prompt?: string | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          estimated_cost_usd?: number | null
          estimated_credits?: number | null
          favorited?: boolean
          id?: string
          input_payload?: Json
          kind?: string
          output_type?: string | null
          output_url?: string | null
          prompt?: string | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          position: number
          template_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          position?: number
          template_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "template_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      template_collections: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          slug: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          slug: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          slug?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_favorites: {
        Row: {
          created_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          ai_prompt: string | null
          category: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          edges_count: number | null
          estimated_credits_per_run: number
          expected_output_count: number | null
          id: string
          input_schema: Json | null
          is_active: boolean
          name: string
          nodes_count: number | null
          output_type: string | null
          owner_type: string
          preview_url: string | null
          raw_json: Json | null
          required_inputs: Json | null
          revenue_split_override: Json | null
          tags: string[] | null
          updated_at: string
          weavy_flow_url: string | null
          weavy_recipe_id: string | null
          weavy_recipe_version: number | null
        }
        Insert: {
          ai_prompt?: string | null
          category?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          edges_count?: number | null
          estimated_credits_per_run?: number
          expected_output_count?: number | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          name: string
          nodes_count?: number | null
          output_type?: string | null
          owner_type?: string
          preview_url?: string | null
          raw_json?: Json | null
          required_inputs?: Json | null
          revenue_split_override?: Json | null
          tags?: string[] | null
          updated_at?: string
          weavy_flow_url?: string | null
          weavy_recipe_id?: string | null
          weavy_recipe_version?: number | null
        }
        Update: {
          ai_prompt?: string | null
          category?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          edges_count?: number | null
          estimated_credits_per_run?: number
          expected_output_count?: number | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          name?: string
          nodes_count?: number | null
          output_type?: string | null
          owner_type?: string
          preview_url?: string | null
          raw_json?: Json | null
          required_inputs?: Json | null
          revenue_split_override?: Json | null
          tags?: string[] | null
          updated_at?: string
          weavy_flow_url?: string | null
          weavy_recipe_id?: string | null
          weavy_recipe_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_charges: {
        Row: {
          charge_type: string
          created_at: string
          credits_spent: number
          id: string
          project_id: string | null
          step_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          template_id: string | null
          usd_cost_basis_cents: number
          usd_price_cents: number
          user_id: string
        }
        Insert: {
          charge_type: string
          created_at?: string
          credits_spent?: number
          id?: string
          project_id?: string | null
          step_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          template_id?: string | null
          usd_cost_basis_cents?: number
          usd_price_cents?: number
          user_id: string
        }
        Update: {
          charge_type?: string
          created_at?: string
          credits_spent?: number
          id?: string
          project_id?: string | null
          step_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          template_id?: string | null
          usd_cost_basis_cents?: number
          usd_price_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_charges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_charges_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "project_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_charges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          body: string | null
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          current_streak: number
          last_active_on: string | null
          longest_streak: number
          total_active_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          last_active_on?: string | null
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          last_active_on?: string | null
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          credits: number | null
          id: string
        }
        Insert: {
          credits?: number | null
          id: string
        }
        Update: {
          credits?: number | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analytics_daily: {
        Args: { _days?: number }
        Returns: {
          day: string
          events: number
          sessions: number
          users: number
        }[]
      }
      analytics_event_counts: {
        Args: { _days?: number }
        Returns: {
          event_name: string
          events: number
          sessions: number
          users: number
        }[]
      }
      analytics_top_paths: {
        Args: { _days?: number }
        Returns: {
          path: string
          sessions: number
          views: number
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          credits_balance: number
          email: string
          id: string
          name: string
          plan: string
          stripe_customer_id: string
          stripe_price_id: string
          stripe_subscription_id: string
          subscription_cycle_credits: number
          subscription_period_end: string
          subscription_period_start: string
          subscription_status: string
          user_id: string
        }[]
      }
      get_my_roles: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      touch_user_streak: {
        Args: never
        Returns: {
          current_streak: number
          last_active_on: string | null
          longest_streak: number
          total_active_days: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_streaks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "user"
      credit_event_type:
        | "run_template"
        | "rerun_step"
        | "topup"
        | "monthly_grant"
        | "refund"
        | "adjustment"
      project_status: "queued" | "running" | "failed" | "complete" | "pending"
      step_status: "queued" | "running" | "failed" | "complete"
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
      app_role: ["admin", "user"],
      credit_event_type: [
        "run_template",
        "rerun_step",
        "topup",
        "monthly_grant",
        "refund",
        "adjustment",
      ],
      project_status: ["queued", "running", "failed", "complete", "pending"],
      step_status: ["queued", "running", "failed", "complete"],
    },
  },
} as const
