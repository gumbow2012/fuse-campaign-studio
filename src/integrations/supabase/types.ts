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
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          project_id: string | null
          template_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
          template_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
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
          completed_at: string | null
          created_at: string
          error: string | null
          failed_at: string | null
          id: string
          inputs: Json | null
          outputs: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["project_status"]
          template_id: string
          updated_at: string
          user_id: string
          weavy_run_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          inputs?: Json | null
          outputs?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          template_id: string
          updated_at?: string
          user_id: string
          weavy_run_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          failed_at?: string | null
          id?: string
          inputs?: Json | null
          outputs?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          template_id?: string
          updated_at?: string
          user_id?: string
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
          created_at: string
          credits_amount: number | null
          id: string
          referred_user_id: string
          referrer_user_id: string
          revenue_allocation_id: string | null
          reward_type: string
        }
        Insert: {
          created_at?: string
          credits_amount?: number | null
          id?: string
          referred_user_id: string
          referrer_user_id: string
          revenue_allocation_id?: string | null
          reward_type: string
        }
        Update: {
          created_at?: string
          credits_amount?: number | null
          id?: string
          referred_user_id?: string
          referrer_user_id?: string
          revenue_allocation_id?: string | null
          reward_type?: string
        }
        Relationships: [
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
      templates: {
        Row: {
          ai_prompt: string | null
          category: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          estimated_credits_per_run: number
          expected_output_count: number | null
          id: string
          input_schema: Json | null
          is_active: boolean
          name: string
          output_type: string | null
          owner_type: string
          preview_url: string | null
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
          estimated_credits_per_run?: number
          expected_output_count?: number | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          name: string
          output_type?: string | null
          owner_type?: string
          preview_url?: string | null
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
          estimated_credits_per_run?: number
          expected_output_count?: number | null
          id?: string
          input_schema?: Json | null
          is_active?: boolean
          name?: string
          output_type?: string | null
          owner_type?: string
          preview_url?: string | null
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
      project_status: "queued" | "running" | "failed" | "complete"
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
      project_status: ["queued", "running", "failed", "complete"],
      step_status: ["queued", "running", "failed", "complete"],
    },
  },
} as const
