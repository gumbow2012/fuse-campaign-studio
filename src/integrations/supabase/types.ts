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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_models: {
        Row: {
          api_endpoint: string | null
          cost_per_run: number | null
          expected_input_schema: Json | null
          id: string
          model_name: string | null
          provider_name: string | null
        }
        Insert: {
          api_endpoint?: string | null
          cost_per_run?: number | null
          expected_input_schema?: Json | null
          id?: string
          model_name?: string | null
          provider_name?: string | null
        }
        Update: {
          api_endpoint?: string | null
          cost_per_run?: number | null
          expected_input_schema?: Json | null
          id?: string
          model_name?: string | null
          provider_name?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          asset_type: string
          created_at: string | null
          id: string
          metadata: Json | null
          supabase_storage_url: string
        }
        Insert: {
          asset_type: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          supabase_storage_url: string
        }
        Update: {
          asset_type?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          supabase_storage_url?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          job_id: string | null
          message: string
          metadata: Json | null
          request_id: string | null
          severity: string
          source: string
          step_id: string | null
          template_id: string | null
          user_id: string | null
          version_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          event_type: string
          id?: string
          job_id?: string | null
          message: string
          metadata?: Json | null
          request_id?: string | null
          severity?: string
          source?: string
          step_id?: string | null
          template_id?: string | null
          user_id?: string | null
          version_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          event_type?: string
          id?: string
          job_id?: string | null
          message?: string
          metadata?: Json | null
          request_id?: string | null
          severity?: string
          source?: string
          step_id?: string | null
          template_id?: string | null
          user_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "execution_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fuse_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          payload: Json
          stripe_customer_id: string | null
          stripe_event_id: string
          stripe_invoice_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          stripe_customer_id?: string | null
          stripe_event_id: string
          stripe_invoice_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          stripe_customer_id?: string | null
          stripe_event_id?: string
          stripe_invoice_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
          project_id?: string | null
          step_id?: string | null
          template_id?: string | null
          type?: Database["public"]["Enums"]["credit_event_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fuse_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      edges: {
        Row: {
          condition_logic: Json | null
          id: string
          mapping_logic: Json | null
          source_node_id: string
          target_node_id: string
          version_id: string
        }
        Insert: {
          condition_logic?: Json | null
          id?: string
          mapping_logic?: Json | null
          source_node_id: string
          target_node_id: string
          version_id: string
        }
        Update: {
          condition_logic?: Json | null
          id?: string
          mapping_logic?: Json | null
          source_node_id?: string
          target_node_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edges_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_jobs: {
        Row: {
          completed_at: string | null
          error_log: string | null
          id: string
          input_payload: Json
          progress: number
          result_payload: Json
          started_at: string | null
          status: string | null
          template_id: string | null
          user_id: string | null
          version_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_log?: string | null
          id?: string
          input_payload?: Json
          progress?: number
          result_payload?: Json
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          user_id?: string | null
          version_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_log?: string | null
          id?: string
          input_payload?: Json
          progress?: number
          result_payload?: Json
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          user_id?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fuse_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_jobs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_steps: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_log: string | null
          execution_time_ms: number | null
          id: string
          input_payload: Json | null
          job_id: string
          node_id: string | null
          output_asset_id: string | null
          output_payload: Json | null
          provider: string | null
          provider_model: string | null
          provider_request_id: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: string | null
          execution_time_ms?: number | null
          id?: string
          input_payload?: Json | null
          job_id: string
          node_id?: string | null
          output_asset_id?: string | null
          output_payload?: Json | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: string | null
          execution_time_ms?: number | null
          id?: string
          input_payload?: Json | null
          job_id?: string
          node_id?: string | null
          output_asset_id?: string | null
          output_payload?: Json | null
          provider?: string | null
          provider_model?: string | null
          provider_request_id?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_steps_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execution_steps_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      fuse_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      nodes: {
        Row: {
          created_at: string | null
          default_asset_id: string | null
          id: string
          model_id: string | null
          name: string | null
          node_type: string
          prompt_config: Json | null
          version_id: string
        }
        Insert: {
          created_at?: string | null
          default_asset_id?: string | null
          id?: string
          model_id?: string | null
          name?: string | null
          node_type: string
          prompt_config?: Json | null
          version_id: string
        }
        Update: {
          created_at?: string | null
          default_asset_id?: string | null
          id?: string
          model_id?: string | null
          name?: string | null
          node_type?: string
          prompt_config?: Json | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_default_asset_id_fkey"
            columns: ["default_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "ai_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nodes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "template_versions"
            referencedColumns: ["id"]
          },
        ]
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
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          subscription_cycle_credits: number
          subscription_period_end: string | null
          subscription_period_start: string | null
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
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cycle_credits?: number
          subscription_period_end?: string | null
          subscription_period_start?: string | null
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
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cycle_credits?: number
          subscription_period_end?: string | null
          subscription_period_start?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_period_grants: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          credits_granted: number
          id: string
          ledger_id: string | null
          stripe_customer_id: string
          stripe_event_id: string
          stripe_invoice_id: string | null
          stripe_price_id: string
          stripe_subscription_id: string
          user_id: string
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          credits_granted: number
          id?: string
          ledger_id?: string | null
          stripe_customer_id: string
          stripe_event_id: string
          stripe_invoice_id?: string | null
          stripe_price_id: string
          stripe_subscription_id: string
          user_id: string
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          credits_granted?: number
          id?: string
          ledger_id?: string | null
          stripe_customer_id?: string
          stripe_event_id?: string
          stripe_invoice_id?: string | null
          stripe_price_id?: string
          stripe_subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_period_grants_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          template_id: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          template_id: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "fuse_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      apply_credit_transaction: {
        Args: {
          p_amount: number
          p_description?: string
          p_project_id?: string
          p_step_id?: string
          p_template_id?: string
          p_type: Database["public"]["Enums"]["credit_event_type"]
          p_user_id: string
        }
        Returns: {
          ledger_id: string
          new_balance: number
        }[]
      }
      decrement_credits: {
        Args: {
          p_amount: number
          p_description?: string
          p_project_id?: string
          p_step_id?: string
          p_template_id?: string
          p_user_id: string
        }
        Returns: number
      }
      get_my_profile: {
        Args: never
        Returns: {
          created_at: string
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
          updated_at: string
          user_id: string
        }[]
      }
      get_my_roles: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      grant_subscription_credits: {
        Args: {
          p_billing_period_end: string
          p_billing_period_start: string
          p_credits_granted: number
          p_description?: string
          p_stripe_customer_id: string
          p_stripe_event_id: string
          p_stripe_invoice_id: string
          p_stripe_price_id: string
          p_stripe_subscription_id: string
          p_user_id: string
        }
        Returns: {
          grant_id: string
          granted: boolean
          ledger_id: string
          new_balance: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_error_code?: string
          p_event_type: string
          p_job_id?: string
          p_message: string
          p_metadata?: Json
          p_request_id?: string
          p_severity?: string
          p_source?: string
          p_step_id?: string
          p_template_id?: string
          p_version_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user" | "dev"
      credit_event_type:
        | "run_template"
        | "rerun_step"
        | "topup"
        | "monthly_grant"
        | "refund"
        | "adjustment"
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
      app_role: ["admin", "user", "dev"],
      credit_event_type: [
        "run_template",
        "rerun_step",
        "topup",
        "monthly_grant",
        "refund",
        "adjustment",
      ],
    },
  },
} as const
