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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      box_items: {
        Row: {
          box_id: string
          created_at: string
          id: string
          quantity: number
          snack_id: string
        }
        Insert: {
          box_id: string
          created_at?: string
          id?: string
          quantity?: number
          snack_id: string
        }
        Update: {
          box_id?: string
          created_at?: string
          id?: string
          quantity?: number
          snack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_items_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_items_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      boxes: {
        Row: {
          box_type: string
          cadence: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_subscription: boolean
          price_cents: number
          slot_count: number | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          box_type?: string
          cadence?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_subscription?: boolean
          price_cents: number
          slot_count?: number | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          box_type?: string
          cadence?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_subscription?: boolean
          price_cents?: number
          slot_count?: number | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_item_snacks: {
        Row: {
          cart_item_id: string
          created_at: string
          id: string
          quantity: number
          snack_id: string
        }
        Insert: {
          cart_item_id: string
          created_at?: string
          id?: string
          quantity?: number
          snack_id: string
        }
        Update: {
          cart_item_id?: string
          created_at?: string
          id?: string
          quantity?: number
          snack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_item_snacks_cart_item_id_fkey"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_item_snacks_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          box_id: string | null
          cart_id: string
          created_at: string
          id: string
          item_type: string
          quantity: number
          snack_id: string | null
          updated_at: string
        }
        Insert: {
          box_id?: string | null
          cart_id: string
          created_at?: string
          id?: string
          item_type: string
          quantity?: number
          snack_id?: string | null
          updated_at?: string
        }
        Update: {
          box_id?: string | null
          cart_id?: string
          created_at?: string
          id?: string
          item_type?: string
          quantity?: number
          snack_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          anonymous_id: string | null
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activity: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          postal_code: string
          recipient_name: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          postal_code: string
          recipient_name: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          postal_code?: string
          recipient_name?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_preferences: {
        Row: {
          created_at: string
          dietary_restrictions: string[]
          disliked_categories: string[]
          flavor_profile: string[]
          id: string
          marketing_opt_in: boolean
          spice_tolerance: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dietary_restrictions?: string[]
          disliked_categories?: string[]
          flavor_profile?: string[]
          id?: string
          marketing_opt_in?: boolean
          spice_tolerance?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dietary_restrictions?: string[]
          disliked_categories?: string[]
          flavor_profile?: string[]
          id?: string
          marketing_opt_in?: boolean
          spice_tolerance?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drops: {
        Row: {
          box_id: string
          created_at: string
          ends_at: string
          id: string
          quantity_limit: number
          starts_at: string
          units_sold: number
          updated_at: string
        }
        Insert: {
          box_id: string
          created_at?: string
          ends_at: string
          id?: string
          quantity_limit: number
          starts_at: string
          units_sold?: number
          updated_at?: string
        }
        Update: {
          box_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          quantity_limit?: number
          starts_at?: string
          units_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drops_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          quantity_on_hand: number
          snack_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          quantity_on_hand?: number
          snack_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          quantity_on_hand?: number
          snack_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: true
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_events: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          reason: string
          reference_id: string | null
          snack_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          reason: string
          reference_id?: string | null
          snack_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          reason?: string
          reference_id?: string | null
          snack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_events_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_orders: {
        Row: {
          amount_cents: number
          created_at: string
          email: string
          id: string
          matched_user_id: string | null
          product_description: string | null
          stripe_payment_intent_id: string
        }
        Insert: {
          amount_cents: number
          created_at: string
          email: string
          id?: string
          matched_user_id?: string | null
          product_description?: string | null
          stripe_payment_intent_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          email?: string
          id?: string
          matched_user_id?: string | null
          product_description?: string | null
          stripe_payment_intent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_orders_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_snacks: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          snack_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          quantity?: number
          snack_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          snack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_snacks_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_snacks_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          box_id: string | null
          created_at: string
          id: string
          item_type: string
          order_id: string
          quantity: number
          snack_id: string | null
          unit_price_cents: number
        }
        Insert: {
          box_id?: string | null
          created_at?: string
          id?: string
          item_type: string
          order_id: string
          quantity?: number
          snack_id?: string | null
          unit_price_cents: number
        }
        Update: {
          box_id?: string | null
          created_at?: string
          id?: string
          item_type?: string
          order_id?: string
          quantity?: number
          snack_id?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          shipping_address: Json | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount_cents: number
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount_cents?: number
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount_cents?: number
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          box_id: string | null
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          snack_id: string | null
          sort_order: number
        }
        Insert: {
          alt_text?: string | null
          box_id?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          snack_id?: string | null
          sort_order?: number
        }
        Update: {
          alt_text?: string | null
          box_id?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          snack_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_snack_id_fkey"
            columns: ["snack_id"]
            isOneToOne: false
            referencedRelation: "snacks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          referral_code: string
          referred_by: string | null
          rewards_points: number
          role: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email: string
          id: string
          referral_code?: string
          referred_by?: string | null
          rewards_points?: number
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          referral_code?: string
          referred_by?: string | null
          rewards_points?: number
          role?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          expires_at: string | null
          id: string
          updated_at: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type: string
          expires_at?: string | null
          id?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          expires_at?: string | null
          id?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_issued_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_issued_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_issued_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards_ledger: {
        Row: {
          created_at: string
          delta_points: number
          id: string
          order_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta_points: number
          id?: string
          order_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta_points?: number
          id?: string
          order_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      snacks: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          id: string
          is_byo_eligible: boolean
          is_sellable_individually: boolean
          name: string
          nutrition_json: Json | null
          price_cents: number | null
          slug: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_byo_eligible?: boolean
          is_sellable_individually?: boolean
          name: string
          nutrition_json?: Json | null
          price_cents?: number | null
          slug: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          is_byo_eligible?: boolean
          is_sellable_individually?: boolean
          name?: string
          nutrition_json?: Json | null
          price_cents?: number | null
          slug?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          box_id: string
          created_at: string
          id: string
          next_delivery_at: string | null
          status: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          box_id: string
          created_at?: string
          id?: string
          next_delivery_at?: string | null
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          box_id?: string
          created_at?: string
          id?: string
          next_delivery_at?: string | null
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_lifetime_value: {
        Row: {
          avg_order_value_cents: number | null
          first_order_at: string | null
          last_order_at: string | null
          total_orders: number | null
          total_spend_cents: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
