export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      consents: {
        Row: {
          customer_id: string
          granted: boolean
          id: string
          purpose: string
          recorded_at: string
        }
        Insert: {
          customer_id: string
          granted: boolean
          id?: string
          purpose: string
          recorded_at?: string
        }
        Update: {
          customer_id?: string
          granted?: boolean
          id?: string
          purpose?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          locale: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
        }
        Relationships: []
      }
      fiscal_documents: {
        Row: {
          amount_cents: number
          created_at: string
          external_ref: string | null
          id: string
          issued_by: string
          issued_to: string
          kind: Database["public"]["Enums"]["fiscal_doc_kind"]
          order_id: string
          simulated: boolean
        }
        Insert: {
          amount_cents: number
          created_at?: string
          external_ref?: string | null
          id?: string
          issued_by: string
          issued_to: string
          kind: Database["public"]["Enums"]["fiscal_doc_kind"]
          order_id: string
          simulated?: boolean
        }
        Update: {
          amount_cents?: number
          created_at?: string
          external_ref?: string | null
          id?: string
          issued_by?: string
          issued_to?: string
          kind?: Database["public"]["Enums"]["fiscal_doc_kind"]
          order_id?: string
          simulated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      flights: {
        Row: {
          boarding_at: string
          carrier: string
          departs_at: string
          destination: string
          destination_code: string
          flight_number: string
          gate: string | null
          id: string
          non_eu: boolean
          status: string
          updated_at: string
        }
        Insert: {
          boarding_at: string
          carrier: string
          departs_at: string
          destination: string
          destination_code: string
          flight_number: string
          gate?: string | null
          id: string
          non_eu?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          boarding_at?: string
          carrier?: string
          departs_at?: string
          destination?: string
          destination_code?: string
          flight_number?: string
          gate?: string | null
          id?: string
          non_eu?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          created_at: string
          id: number
          message: string
          order_id: string | null
          robot_id: string | null
          severity: string
        }
        Insert: {
          created_at?: string
          id?: number
          message: string
          order_id?: string | null
          robot_id?: string | null
          severity: string
        }
        Update: {
          created_at?: string
          id?: number
          message?: string
          order_id?: string | null
          robot_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_prep_overrides: {
        Row: {
          hour_of_day: number
          merchant_id: string
          prep_minutes: number
        }
        Insert: {
          hour_of_day: number
          merchant_id: string
          prep_minutes: number
        }
        Update: {
          hour_of_day?: number
          merchant_id?: string
          prep_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "merchant_prep_overrides_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_staff: {
        Row: {
          created_at: string
          merchant_id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          merchant_id: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          merchant_id?: string
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_staff_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          blurb: string
          closes_at: string | null
          colour: string
          commission_rate: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["merchant_kind"]
          logo_url: string | null
          name: string
          open: boolean
          opens_at: string | null
          prep_minutes: number
          slug: string
          updated_at: string
          waypoint_id: string
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          blurb?: string
          closes_at?: string | null
          colour?: string
          commission_rate?: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["merchant_kind"]
          logo_url?: string | null
          name: string
          open?: boolean
          opens_at?: string | null
          prep_minutes?: number
          slug: string
          updated_at?: string
          waypoint_id: string
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          blurb?: string
          closes_at?: string | null
          colour?: string
          commission_rate?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["merchant_kind"]
          logo_url?: string | null
          name?: string
          open?: boolean
          opens_at?: string | null
          prep_minutes?: number
          slug?: string
          updated_at?: string
          waypoint_id?: string
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "merchants_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchants_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_stops: {
        Row: {
          compartment_id: string | null
          done: boolean
          id: string
          kind: string
          mission_id: string
          order_id: string | null
          seq: number
          waypoint_id: string
        }
        Insert: {
          compartment_id?: string | null
          done?: boolean
          id?: string
          kind: string
          mission_id: string
          order_id?: string | null
          seq: number
          waypoint_id: string
        }
        Update: {
          compartment_id?: string | null
          done?: boolean
          id?: string
          kind?: string
          mission_id?: string
          order_id?: string | null
          seq?: number
          waypoint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_stops_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_stops_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          finished_at: string | null
          id: string
          robot_id: string | null
          started_at: string
          status: string
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          finished_at?: string | null
          id?: string
          robot_id?: string | null
          started_at?: string
          status?: string
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          finished_at?: string | null
          id?: string
          robot_id?: string | null
          started_at?: string
          status?: string
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "missions_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          created_at: string
          id: number
          note: string | null
          order_id: string
          state: Database["public"]["Enums"]["order_state"]
        }
        Insert: {
          actor?: string
          created_at?: string
          id?: number
          note?: string | null
          order_id: string
          state: Database["public"]["Enums"]["order_state"]
        }
        Update: {
          actor?: string
          created_at?: string
          id?: number
          note?: string | null
          order_id?: string
          state?: Database["public"]["Enums"]["order_state"]
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_options: {
        Row: {
          id: string
          name: string
          option_id: string | null
          order_line_id: string
          price_delta_cents: number
        }
        Insert: {
          id?: string
          name: string
          option_id?: string | null
          order_line_id: string
          price_delta_cents?: number
        }
        Update: {
          id?: string
          name?: string
          option_id?: string | null
          order_line_id?: string
          price_delta_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_line_options_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_options_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          emoji: string
          id: string
          name: string
          notes: string
          order_id: string
          product_id: string | null
          qty: number
          unit_price_cents: number
        }
        Insert: {
          emoji?: string
          id?: string
          name: string
          notes?: string
          order_id: string
          product_id?: string | null
          qty: number
          unit_price_cents: number
        }
        Update: {
          emoji?: string
          id?: string
          name?: string
          notes?: string
          order_id?: string
          product_id?: string | null
          qty?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          commission_cents: number
          compartment_id: string | null
          created_at: string
          customer_id: string | null
          delivery_fee_cents: number
          flight_id: string | null
          goods_cents: number
          handover_code: string
          id: string
          location_kind: Database["public"]["Enums"]["delivery_location_kind"]
          location_note: string
          merchant_id: string
          mission_id: string | null
          nav_waypoint_id: string
          passenger_name: string
          pin_x: number | null
          pin_y: number | null
          promise_deadline: string | null
          promise_deliver_by: string | null
          promise_inputs: Json
          ref: string
          refunded_cents: number
          rejection_reason: string | null
          robot_id: string | null
          seat_id: string | null
          sla_missed: boolean
          state: Database["public"]["Enums"]["order_state"]
          total_cents: number
          updated_at: string
          walk_metres: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          commission_cents?: number
          compartment_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_fee_cents?: number
          flight_id?: string | null
          goods_cents?: number
          handover_code?: string
          id?: string
          location_kind?: Database["public"]["Enums"]["delivery_location_kind"]
          location_note?: string
          merchant_id: string
          mission_id?: string | null
          nav_waypoint_id: string
          passenger_name?: string
          pin_x?: number | null
          pin_y?: number | null
          promise_deadline?: string | null
          promise_deliver_by?: string | null
          promise_inputs?: Json
          ref?: string
          refunded_cents?: number
          rejection_reason?: string | null
          robot_id?: string | null
          seat_id?: string | null
          sla_missed?: boolean
          state?: Database["public"]["Enums"]["order_state"]
          total_cents?: number
          updated_at?: string
          walk_metres?: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          commission_cents?: number
          compartment_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_fee_cents?: number
          flight_id?: string | null
          goods_cents?: number
          handover_code?: string
          id?: string
          location_kind?: Database["public"]["Enums"]["delivery_location_kind"]
          location_note?: string
          merchant_id?: string
          mission_id?: string | null
          nav_waypoint_id?: string
          passenger_name?: string
          pin_x?: number | null
          pin_y?: number | null
          promise_deadline?: string | null
          promise_deliver_by?: string | null
          promise_inputs?: Json
          ref?: string
          refunded_cents?: number
          rejection_reason?: string | null
          robot_id?: string | null
          seat_id?: string | null
          sla_missed?: boolean
          state?: Database["public"]["Enums"]["order_state"]
          total_cents?: number
          updated_at?: string
          walk_metres?: number
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_nav_waypoint_id_fkey"
            columns: ["nav_waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          authorized_at: string | null
          captured_at: string | null
          created_at: string
          id: string
          order_id: string
          provider: string
          provider_ref: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount_cents: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          id?: string
          order_id: string
          provider?: string
          provider_ref?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          authorized_at?: string | null
          captured_at?: string | null
          created_at?: string
          id?: string
          order_id?: string
          provider?: string
          provider_ref?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          id: string
          merchant_id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          merchant_id: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          merchant_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          id: string
          max_select: number
          min_select: number
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          max_select?: number
          min_select?: number
          name: string
          product_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          available: boolean
          group_id: string
          id: string
          name: string
          price_delta_cents: number
          sort_order: number
        }
        Insert: {
          available?: boolean
          group_id: string
          id?: string
          name: string
          price_delta_cents?: number
          sort_order?: number
        }
        Update: {
          available?: boolean
          group_id?: string
          id?: string
          name?: string
          price_delta_cents?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          age_restricted: boolean
          allergens: string[]
          available: boolean
          category_id: string | null
          created_at: string
          description: string
          emoji: string
          id: string
          image_url: string | null
          merchant_id: string
          name: string
          price_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          age_restricted?: boolean
          allergens?: string[]
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          image_url?: string | null
          merchant_id: string
          name: string
          price_cents: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          age_restricted?: boolean
          allergens?: string[]
          available?: boolean
          category_id?: string | null
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          image_url?: string | null
          merchant_id?: string
          name?: string
          price_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      robot_compartments: {
        Row: {
          id: string
          label: string
          locked: boolean
          occupied: boolean
          order_id: string | null
          robot_id: string
        }
        Insert: {
          id: string
          label: string
          locked?: boolean
          occupied?: boolean
          order_id?: string | null
          robot_id: string
        }
        Update: {
          id?: string
          label?: string
          locked?: boolean
          occupied?: boolean
          order_id?: string | null
          robot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "robot_compartments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robot_compartments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robot_compartments_robot_id_fkey"
            columns: ["robot_id"]
            isOneToOne: false
            referencedRelation: "robots"
            referencedColumns: ["id"]
          },
        ]
      }
      robots: {
        Row: {
          battery_pct: number
          charging: boolean
          heading: number
          home_dock_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
          vendor: string
          vendor_ref: string | null
          waypoint_id: string | null
          x: number
          y: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          battery_pct?: number
          charging?: boolean
          heading?: number
          home_dock_id?: string | null
          id: string
          name: string
          status?: string
          updated_at?: string
          vendor?: string
          vendor_ref?: string | null
          waypoint_id?: string | null
          x?: number
          y?: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          battery_pct?: number
          charging?: boolean
          heading?: number
          home_dock_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          vendor?: string
          vendor_ref?: string | null
          waypoint_id?: string | null
          x?: number
          y?: number
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "robots_home_dock_id_fkey"
            columns: ["home_dock_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robots_waypoint_id_fkey"
            columns: ["waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "robots_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      route_edges: {
        Row: {
          from_waypoint: string
          metres: number
          to_waypoint: string
        }
        Insert: {
          from_waypoint: string
          metres: number
          to_waypoint: string
        }
        Update: {
          from_waypoint?: string
          metres?: number
          to_waypoint?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_edges_from_waypoint_fkey"
            columns: ["from_waypoint"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_edges_to_waypoint_fkey"
            columns: ["to_waypoint"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          active: boolean
          created_at: string
          gate: string | null
          id: string
          nav_waypoint_id: string
          qr_token: string
          row_label: string
          seat_label: string
          walk_metres: number
          x: number
          y: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          gate?: string | null
          id: string
          nav_waypoint_id: string
          qr_token?: string
          row_label: string
          seat_label: string
          walk_metres?: number
          x: number
          y: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          active?: boolean
          created_at?: string
          gate?: string | null
          id?: string
          nav_waypoint_id?: string
          qr_token?: string
          row_label?: string
          seat_label?: string
          walk_metres?: number
          x?: number
          y?: number
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "seats_nav_waypoint_id_fkey"
            columns: ["nav_waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      waypoints: {
        Row: {
          created_at: string
          dispatchable: boolean
          gate: string | null
          id: string
          kind: Database["public"]["Enums"]["waypoint_kind"]
          landmark: string
          name: string
          x: number
          y: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Insert: {
          created_at?: string
          dispatchable?: boolean
          gate?: string | null
          id: string
          kind: Database["public"]["Enums"]["waypoint_kind"]
          landmark?: string
          name: string
          x: number
          y: number
          zone: Database["public"]["Enums"]["zone_id"]
        }
        Update: {
          created_at?: string
          dispatchable?: boolean
          gate?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["waypoint_kind"]
          landmark?: string
          name?: string
          x?: number
          y?: number
          zone?: Database["public"]["Enums"]["zone_id"]
        }
        Relationships: [
          {
            foreignKeyName: "waypoints_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          allows_age_restricted: boolean
          id: Database["public"]["Enums"]["zone_id"]
          name: string
          orderable: boolean
          safety_margin_min: number
          short_name: string
          speed_limit_mps: number
        }
        Insert: {
          allows_age_restricted?: boolean
          id: Database["public"]["Enums"]["zone_id"]
          name: string
          orderable?: boolean
          safety_margin_min?: number
          short_name: string
          speed_limit_mps?: number
        }
        Update: {
          allows_age_restricted?: boolean
          id?: Database["public"]["Enums"]["zone_id"]
          name?: string
          orderable?: boolean
          safety_margin_min?: number
          short_name?: string
          speed_limit_mps?: number
        }
        Relationships: []
      }
    }
    Views: {
      order_details: {
        Row: {
          boarding_at: string | null
          carrier: string | null
          commission_cents: number | null
          compartment_id: string | null
          created_at: string | null
          customer_id: string | null
          delivery_fee_cents: number | null
          destination: string | null
          destination_code: string | null
          flight_gate: string | null
          flight_id: string | null
          flight_number: string | null
          goods_cents: number | null
          handover_code: string | null
          id: string | null
          lines: Json | null
          location_kind:
            | Database["public"]["Enums"]["delivery_location_kind"]
            | null
          location_note: string | null
          merchant_colour: string | null
          merchant_id: string | null
          merchant_name: string | null
          merchant_slug: string | null
          mission_id: string | null
          nav_waypoint_id: string | null
          nav_waypoint_landmark: string | null
          nav_waypoint_name: string | null
          passenger_name: string | null
          pin_x: number | null
          pin_y: number | null
          promise_deadline: string | null
          promise_deliver_by: string | null
          promise_inputs: Json | null
          ref: string | null
          refunded_cents: number | null
          rejection_reason: string | null
          robot_id: string | null
          seat_id: string | null
          sla_missed: boolean | null
          state: Database["public"]["Enums"]["order_state"] | null
          total_cents: number | null
          updated_at: string | null
          walk_metres: number | null
          zone: Database["public"]["Enums"]["zone_id"] | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_nav_waypoint_id_fkey"
            columns: ["nav_waypoint_id"]
            isOneToOne: false
            referencedRelation: "waypoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_zone_fkey"
            columns: ["zone"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_order: { Args: { payload: Json }; Returns: string }
      is_merchant_staff: { Args: { p_merchant: string }; Returns: boolean }
      my_merchant_ids: { Args: never; Returns: string[] }
      nearest_waypoint: {
        Args: {
          p_x: number
          p_y: number
          p_zone: Database["public"]["Enums"]["zone_id"]
        }
        Returns: {
          metres: number
          waypoint_id: string
        }[]
      }
      resolve_delivery_location: {
        Args: {
          p_kind: Database["public"]["Enums"]["delivery_location_kind"]
          p_pin_x?: number
          p_pin_y?: number
          p_seat_id?: string
          p_waypoint_id?: string
          p_zone: Database["public"]["Enums"]["zone_id"]
        }
        Returns: {
          nav_waypoint_id: string
          note: string
          walk_metres: number
        }[]
      }
    }
    Enums: {
      delivery_location_kind: "seat" | "pin" | "waypoint"
      fiscal_doc_kind:
        | "merchant-goods-receipt"
        | "platform-fee-receipt"
        | "commission-invoice"
        | "airport-share-invoice"
      merchant_kind: "cafe" | "market" | "restaurant" | "bar" | "retail"
      order_state:
        | "DRAFT"
        | "VALIDATED"
        | "AUTHORIZED"
        | "SENT_TO_MERCHANT"
        | "ACCEPTED"
        | "PREPARING"
        | "READY"
        | "ROBOT_ASSIGNED"
        | "AT_MERCHANT"
        | "LOADED"
        | "IN_TRANSIT"
        | "ARRIVED"
        | "HANDED_OVER"
        | "COMPLETED"
        | "REJECTED"
        | "CANCELLED"
        | "ABORTED"
        | "NO_SHOW"
      staff_role: "owner" | "manager" | "staff"
      waypoint_kind: "gate" | "merchant" | "dock" | "holding" | "seat"
      zone_id:
        | "landside"
        | "airside-schengen"
        | "airside-non-schengen"
        | "arrivals"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      delivery_location_kind: ["seat", "pin", "waypoint"],
      fiscal_doc_kind: [
        "merchant-goods-receipt",
        "platform-fee-receipt",
        "commission-invoice",
        "airport-share-invoice",
      ],
      merchant_kind: ["cafe", "market", "restaurant", "bar", "retail"],
      order_state: [
        "DRAFT",
        "VALIDATED",
        "AUTHORIZED",
        "SENT_TO_MERCHANT",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "ROBOT_ASSIGNED",
        "AT_MERCHANT",
        "LOADED",
        "IN_TRANSIT",
        "ARRIVED",
        "HANDED_OVER",
        "COMPLETED",
        "REJECTED",
        "CANCELLED",
        "ABORTED",
        "NO_SHOW",
      ],
      staff_role: ["owner", "manager", "staff"],
      waypoint_kind: ["gate", "merchant", "dock", "holding", "seat"],
      zone_id: [
        "landside",
        "airside-schengen",
        "airside-non-schengen",
        "arrivals",
      ],
    },
  },
} as const

