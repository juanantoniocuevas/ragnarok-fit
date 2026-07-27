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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      measurements: {
        Row: {
          activity_level: string | null
          arm_flexed_cm: number | null
          arm_relaxed_cm: number | null
          bmr: number | null
          body_fat_pct: number | null
          calf_cm: number | null
          created_at: string
          daily_calories: number | null
          deleted_at: string | null
          fat_mass_kg: number | null
          healthy_weight_kg: number | null
          height_cm: number | null
          hip_cm: number | null
          id: string
          imc: number | null
          lean_mass_kg: number | null
          mid_thigh_cm: number | null
          muscle_mass_kg: number | null
          neck_cm: number | null
          updated_at: string
          user_id: string
          visceral_fat: number | null
          waist_cm: number | null
          water_pct: number | null
          weight_kg: number
        }
        Insert: {
          activity_level?: string | null
          arm_flexed_cm?: number | null
          arm_relaxed_cm?: number | null
          bmr?: number | null
          body_fat_pct?: number | null
          calf_cm?: number | null
          created_at?: string
          daily_calories?: number | null
          deleted_at?: string | null
          fat_mass_kg?: number | null
          healthy_weight_kg?: number | null
          height_cm?: number | null
          hip_cm?: number | null
          id?: string
          imc?: number | null
          lean_mass_kg?: number | null
          mid_thigh_cm?: number | null
          muscle_mass_kg?: number | null
          neck_cm?: number | null
          updated_at?: string
          user_id: string
          visceral_fat?: number | null
          waist_cm?: number | null
          water_pct?: number | null
          weight_kg: number
        }
        Update: {
          activity_level?: string | null
          arm_flexed_cm?: number | null
          arm_relaxed_cm?: number | null
          bmr?: number | null
          body_fat_pct?: number | null
          calf_cm?: number | null
          created_at?: string
          daily_calories?: number | null
          deleted_at?: string | null
          fat_mass_kg?: number | null
          healthy_weight_kg?: number | null
          height_cm?: number | null
          hip_cm?: number | null
          id?: string
          imc?: number | null
          lean_mass_kg?: number | null
          mid_thigh_cm?: number | null
          muscle_mass_kg?: number | null
          neck_cm?: number | null
          updated_at?: string
          user_id?: string
          visceral_fat?: number | null
          waist_cm?: number | null
          water_pct?: number | null
          weight_kg?: number
        }
        Relationships: []
      }
      physical_profiles: {
        Row: {
          age: number | null
          created_at: string
          goal: string | null
          height_cm: number | null
          id: string
          sex: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          created_at?: string
          goal?: string | null
          height_cm?: number | null
          id?: string
          sex?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          created_at?: string
          goal?: string | null
          height_cm?: number | null
          id?: string
          sex?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          disabled_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          status: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          disabled_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          status?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          disabled_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          admin_id: string
          client_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          updated_at: string
        }
        Insert: {
          admin_id: string
          client_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          admin_id?: string
          client_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trainer_clients: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          id: string
          requested_by: string | null
          trainer_id: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          requested_by?: string | null
          trainer_id: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          requested_by?: string | null
          trainer_id?: string
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
          role: Database["public"]["Enums"]["app_role"]
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
      is_manageable_client: { Args: { _target: string }; Returns: boolean }
      is_trainer_of: {
        Args: { _client: string; _trainer: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "trainer" | "client"
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
      app_role: ["trainer", "client"],
    },
  },
} as const
