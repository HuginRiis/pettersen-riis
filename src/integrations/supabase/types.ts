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
      agenda_messages: {
        Row: {
          body: string | null
          created_at: string
          event_date: string
          event_time: string | null
          id: string
          notified_at: string | null
          notify_minutes_before: number | null
          subject: string
          who: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_date: string
          event_time?: string | null
          id?: string
          notified_at?: string | null
          notify_minutes_before?: number | null
          subject: string
          who?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_date?: string
          event_time?: string | null
          id?: string
          notified_at?: string | null
          notify_minutes_before?: number | null
          subject?: string
          who?: string
        }
        Relationships: []
      }
      ai_budget_actual: {
        Row: {
          actual_cost_usd: number
          created_at: string
          id: string
          month: string
          monthly_budget_usd: number
          note: string | null
          updated_at: string
        }
        Insert: {
          actual_cost_usd?: number
          created_at?: string
          id?: string
          month: string
          monthly_budget_usd?: number
          note?: string | null
          updated_at?: string
        }
        Update: {
          actual_cost_usd?: number
          created_at?: string
          id?: string
          month?: string
          monthly_budget_usd?: number
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_search_log: {
        Row: {
          authenticated: boolean
          city: string | null
          completion_tokens: number | null
          country: string | null
          created_at: string
          estimated_cost_usd: number | null
          feature: string
          id: string
          ip: string | null
          model: string | null
          prompt_tokens: number | null
          query: string | null
          status: string
          total_tokens: number | null
          user_agent: string | null
        }
        Insert: {
          authenticated?: boolean
          city?: string | null
          completion_tokens?: number | null
          country?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          feature: string
          id?: string
          ip?: string | null
          model?: string | null
          prompt_tokens?: number | null
          query?: string | null
          status?: string
          total_tokens?: number | null
          user_agent?: string | null
        }
        Update: {
          authenticated?: boolean
          city?: string | null
          completion_tokens?: number | null
          country?: string | null
          created_at?: string
          estimated_cost_usd?: number | null
          feature?: string
          id?: string
          ip?: string | null
          model?: string | null
          prompt_tokens?: number | null
          query?: string | null
          status?: string
          total_tokens?: number | null
          user_agent?: string | null
        }
        Relationships: []
      }
      api_call_log: {
        Row: {
          cached: boolean
          called_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          id: string
          metadata: Json | null
          ok: boolean
          source: string
          status_code: number | null
        }
        Insert: {
          cached?: boolean
          called_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          ok?: boolean
          source: string
          status_code?: number | null
        }
        Update: {
          cached?: boolean
          called_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          ok?: boolean
          source?: string
          status_code?: number | null
        }
        Relationships: []
      }
      birthdays: {
        Row: {
          birth_date: string
          created_at: string
          id: string
          name: string
          notified_year: number | null
          notify_enabled: boolean
          notify_recipients: string[]
          title: string | null
          updated_at: string
          words: string | null
        }
        Insert: {
          birth_date: string
          created_at?: string
          id?: string
          name: string
          notified_year?: number | null
          notify_enabled?: boolean
          notify_recipients?: string[]
          title?: string | null
          updated_at?: string
          words?: string | null
        }
        Update: {
          birth_date?: string
          created_at?: string
          id?: string
          name?: string
          notified_year?: number | null
          notify_enabled?: boolean
          notify_recipients?: string[]
          title?: string | null
          updated_at?: string
          words?: string | null
        }
        Relationships: []
      }
      changelog_entries: {
        Row: {
          category: string
          changed_at: string
          created_at: string
          description: string | null
          id: string
          title: string
        }
        Insert: {
          category?: string
          changed_at?: string
          created_at?: string
          description?: string | null
          id?: string
          title: string
        }
        Update: {
          category?: string
          changed_at?: string
          created_at?: string
          description?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      garbage_address: {
        Row: {
          address_text: string
          created_at: string
          gatekode: string
          gatenavn: string
          husnr: string
          id: string
          kommunenr: string
          label: string
          updated_at: string
        }
        Insert: {
          address_text: string
          created_at?: string
          gatekode: string
          gatenavn: string
          husnr: string
          id?: string
          kommunenr: string
          label?: string
          updated_at?: string
        }
        Update: {
          address_text?: string
          created_at?: string
          gatekode?: string
          gatenavn?: string
          husnr?: string
          id?: string
          kommunenr?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      garbage_notification_log: {
        Row: {
          fraksjon_id: number
          id: string
          notified_at: string
          pickup_date: string
        }
        Insert: {
          fraksjon_id: number
          id?: string
          notified_at?: string
          pickup_date: string
        }
        Update: {
          fraksjon_id?: number
          id?: string
          notified_at?: string
          pickup_date?: string
        }
        Relationships: []
      }
      garbage_notification_prefs: {
        Row: {
          created_at: string
          days_before: number
          enabled: boolean
          fraksjon_id: number
          fraksjon_navn: string
          id: string
          notify_hour: number
          notify_minute: number
          updated_at: string
          who: string
        }
        Insert: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          fraksjon_id: number
          fraksjon_navn: string
          id?: string
          notify_hour?: number
          notify_minute?: number
          updated_at?: string
          who?: string
        }
        Update: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          fraksjon_id?: number
          fraksjon_navn?: string
          id?: string
          notify_hour?: number
          notify_minute?: number
          updated_at?: string
          who?: string
        }
        Relationships: []
      }
      grocery_favorites: {
        Row: {
          brand: string | null
          category: string
          checked: boolean
          created_at: string
          ean: string | null
          id: string
          image_url: string | null
          kassal_category: string | null
          manual: boolean
          name: string
          price_nok: number | null
          quantity: number | null
          sort_order: number
          unit: string | null
          vendor: string | null
        }
        Insert: {
          brand?: string | null
          category?: string
          checked?: boolean
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          kassal_category?: string | null
          manual?: boolean
          name: string
          price_nok?: number | null
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          vendor?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          checked?: boolean
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          kassal_category?: string | null
          manual?: boolean
          name?: string
          price_nok?: number | null
          quantity?: number | null
          sort_order?: number
          unit?: string | null
          vendor?: string | null
        }
        Relationships: []
      }
      home_alarm_log: {
        Row: {
          changed_at: string
          id: string
          note: string | null
          source: string
          state: string
          who: string
        }
        Insert: {
          changed_at?: string
          id?: string
          note?: string | null
          source?: string
          state: string
          who?: string
        }
        Update: {
          changed_at?: string
          id?: string
          note?: string | null
          source?: string
          state?: string
          who?: string
        }
        Relationships: []
      }
      homey_connections: {
        Row: {
          access_token: string
          athom_user_id: string | null
          athom_user_name: string | null
          created_at: string
          expires_at: string
          homey_base_url: string | null
          homey_id: string | null
          homey_name: string | null
          homey_target_cached_at: string | null
          id: string
          provider: string
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          athom_user_id?: string | null
          athom_user_name?: string | null
          created_at?: string
          expires_at: string
          homey_base_url?: string | null
          homey_id?: string | null
          homey_name?: string | null
          homey_target_cached_at?: string | null
          id?: string
          provider?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          athom_user_id?: string | null
          athom_user_name?: string | null
          created_at?: string
          expires_at?: string
          homey_base_url?: string | null
          homey_id?: string | null
          homey_name?: string | null
          homey_target_cached_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      homey_rooms: {
        Row: {
          created_at: string
          homey_zone_id: string
          id: string
          location: string
          name: string
          parent_zone_id: string | null
          synced_at: string
        }
        Insert: {
          created_at?: string
          homey_zone_id: string
          id?: string
          location: string
          name: string
          parent_zone_id?: string | null
          synced_at?: string
        }
        Update: {
          created_at?: string
          homey_zone_id?: string
          id?: string
          location?: string
          name?: string
          parent_zone_id?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      hytta_checklist: {
        Row: {
          added_by: string
          checked: boolean
          created_at: string
          id: string
          label: string
          notified_at: string | null
          notify_at: string | null
          notify_who: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          added_by?: string
          checked?: boolean
          created_at?: string
          id?: string
          label: string
          notified_at?: string | null
          notify_at?: string | null
          notify_who?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          added_by?: string
          checked?: boolean
          created_at?: string
          id?: string
          label?: string
          notified_at?: string | null
          notify_at?: string | null
          notify_who?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ip_user_mapping: {
        Row: {
          ip: string
          updated_at: string
          who: string
        }
        Insert: {
          ip: string
          updated_at?: string
          who: string
        }
        Update: {
          ip?: string
          updated_at?: string
          who?: string
        }
        Relationships: []
      }
      light_idle_notification_prefs: {
        Row: {
          cooldown_minutes: number
          created_at: string
          enabled: boolean
          homey_zone_id: string | null
          id: string
          last_notified_at: string | null
          lights_on_minutes: number | null
          no_motion_minutes: number
          recipient: string
          scope: string
          updated_at: string
          zone_name: string | null
        }
        Insert: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          homey_zone_id?: string | null
          id?: string
          last_notified_at?: string | null
          lights_on_minutes?: number | null
          no_motion_minutes?: number
          recipient?: string
          scope?: string
          updated_at?: string
          zone_name?: string | null
        }
        Update: {
          cooldown_minutes?: number
          created_at?: string
          enabled?: boolean
          homey_zone_id?: string | null
          id?: string
          last_notified_at?: string | null
          lights_on_minutes?: number | null
          no_motion_minutes?: number
          recipient?: string
          scope?: string
          updated_at?: string
          zone_name?: string | null
        }
        Relationships: []
      }
      pulse_readings: {
        Row: {
          device_name: string | null
          id: string
          kwh_today: number | null
          location: string
          recorded_at: string
          watt: number | null
        }
        Insert: {
          device_name?: string | null
          id?: string
          kwh_today?: number | null
          location: string
          recorded_at?: string
          watt?: number | null
        }
        Update: {
          device_name?: string | null
          id?: string
          kwh_today?: number | null
          location?: string
          recorded_at?: string
          watt?: number | null
        }
        Relationships: []
      }
      push_send_log: {
        Row: {
          body: string | null
          endpoint: string | null
          error_message: string | null
          feature: string
          id: string
          ok: boolean
          recipient: string
          sent_at: string
          status_code: number | null
          title: string | null
        }
        Insert: {
          body?: string | null
          endpoint?: string | null
          error_message?: string | null
          feature: string
          id?: string
          ok?: boolean
          recipient?: string
          sent_at?: string
          status_code?: number | null
          title?: string | null
        }
        Update: {
          body?: string | null
          endpoint?: string | null
          error_message?: string | null
          feature?: string
          id?: string
          ok?: boolean
          recipient?: string
          sent_at?: string
          status_code?: number | null
          title?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          who: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          who?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          who?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          added_by: string
          ai_model: string | null
          ai_raw_text: string | null
          created_at: string
          currency: string
          id: string
          image_path: string
          image_url: string
          is_food: boolean
          items: Json
          notes: string | null
          purchased_at: string | null
          store: string | null
          total_nok: number | null
          updated_at: string
          warranty_notified_30: string | null
          warranty_notified_60: string | null
          warranty_notified_90: string | null
          warranty_recipient: string
        }
        Insert: {
          added_by?: string
          ai_model?: string | null
          ai_raw_text?: string | null
          created_at?: string
          currency?: string
          id?: string
          image_path: string
          image_url: string
          is_food?: boolean
          items?: Json
          notes?: string | null
          purchased_at?: string | null
          store?: string | null
          total_nok?: number | null
          updated_at?: string
          warranty_notified_30?: string | null
          warranty_notified_60?: string | null
          warranty_notified_90?: string | null
          warranty_recipient?: string
        }
        Update: {
          added_by?: string
          ai_model?: string | null
          ai_raw_text?: string | null
          created_at?: string
          currency?: string
          id?: string
          image_path?: string
          image_url?: string
          is_food?: boolean
          items?: Json
          notes?: string | null
          purchased_at?: string | null
          store?: string | null
          total_nok?: number | null
          updated_at?: string
          warranty_notified_30?: string | null
          warranty_notified_60?: string | null
          warranty_notified_90?: string | null
          warranty_recipient?: string
        }
        Relationships: []
      }
      renovation_contractors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          project_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          project_id: string
          role?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          project_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renovation_contractors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "renovation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      renovation_costs: {
        Row: {
          amount_nok: number
          cost_date: string
          created_at: string
          description: string
          id: string
          kind: string
          project_id: string
        }
        Insert: {
          amount_nok?: number
          cost_date?: string
          created_at?: string
          description: string
          id?: string
          kind?: string
          project_id: string
        }
        Update: {
          amount_nok?: number
          cost_date?: string
          created_at?: string
          description?: string
          id?: string
          kind?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renovation_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "renovation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      renovation_images: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          project_id: string
          sort_order: number
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          project_id: string
          sort_order?: number
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          project_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "renovation_images_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "renovation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      renovation_projects: {
        Row: {
          budget_nok: number | null
          category: string
          completed_at: string | null
          cover_image_url: string | null
          created_at: string
          description: string | null
          homey_zone_id: string | null
          id: string
          location: string
          notes: string | null
          planned_end: string | null
          planned_start: string | null
          priority: string
          room_name: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          budget_nok?: number | null
          category?: string
          completed_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          homey_zone_id?: string | null
          id?: string
          location: string
          notes?: string | null
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          room_name?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          budget_nok?: number | null
          category?: string
          completed_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          homey_zone_id?: string | null
          id?: string
          location?: string
          notes?: string | null
          planned_end?: string | null
          planned_start?: string | null
          priority?: string
          room_name?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      renovation_tasks: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          project_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          project_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          project_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "renovation_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "renovation_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      strava_connections: {
        Row: {
          access_token: string
          athlete_id: number | null
          athlete_name: string | null
          created_at: string
          expires_at: string
          id: string
          owner: string
          provider: string
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          athlete_id?: number | null
          athlete_name?: string | null
          created_at?: string
          expires_at: string
          id?: string
          owner?: string
          provider?: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          athlete_id?: number | null
          athlete_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          owner?: string
          provider?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tibber_daily_kwh: {
        Row: {
          cost: number | null
          created_at: string
          day: string
          id: string
          kwh: number
          location: string
          source: string
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          day: string
          id?: string
          kwh?: number
          location: string
          source?: string
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          day?: string
          id?: string
          kwh?: number
          location?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          path: string
          title: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          path: string
          title: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          path?: string
          title?: string
        }
        Relationships: []
      }
      user_location_prefs: {
        Row: {
          created_at: string
          id: string
          ip: string
          lat: number
          lon: number
          page: string
          place_label: string
          updated_at: string
          who: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip: string
          lat: number
          lon: number
          page: string
          place_label: string
          updated_at?: string
          who: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string
          lat?: number
          lon?: number
          page?: string
          place_label?: string
          updated_at?: string
          who?: string
        }
        Relationships: []
      }
      uv_notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          lat: number
          lead_minutes: number
          location: string
          lon: number
          notified_date_3: string | null
          notified_date_6: string | null
          notified_date_8: string | null
          recipient: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          lat: number
          lead_minutes?: number
          location: string
          lon: number
          notified_date_3?: string | null
          notified_date_6?: string | null
          notified_date_8?: string | null
          recipient?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          lat?: number
          lead_minutes?: number
          location?: string
          lon?: number
          notified_date_3?: string | null
          notified_date_6?: string | null
          notified_date_8?: string | null
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      vakttarn_events: {
        Row: {
          camera: string | null
          category: string
          confidence: number | null
          created_at: string
          detected_at: string
          id: string
          metadata: Json | null
          snapshot_url: string | null
          source: string
        }
        Insert: {
          camera?: string | null
          category: string
          confidence?: number | null
          created_at?: string
          detected_at?: string
          id?: string
          metadata?: Json | null
          snapshot_url?: string | null
          source?: string
        }
        Update: {
          camera?: string | null
          category?: string
          confidence?: number | null
          created_at?: string
          detected_at?: string
          id?: string
          metadata?: Json | null
          snapshot_url?: string | null
          source?: string
        }
        Relationships: []
      }
      visitor_login_attempts: {
        Row: {
          attempted_at: string
          browser: string | null
          city: string | null
          country: string | null
          country_code: string | null
          device_type: string | null
          id: string
          ip: string | null
          latitude: number | null
          longitude: number | null
          os: string | null
          region: string | null
          success: boolean
          user_agent: string | null
          who: string | null
        }
        Insert: {
          attempted_at?: string
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          id?: string
          ip?: string | null
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          region?: string | null
          success?: boolean
          user_agent?: string | null
          who?: string | null
        }
        Update: {
          attempted_at?: string
          browser?: string | null
          city?: string | null
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          id?: string
          ip?: string | null
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          region?: string | null
          success?: boolean
          user_agent?: string | null
          who?: string | null
        }
        Relationships: []
      }
      visitor_pageviews: {
        Row: {
          duration_seconds: number
          entered_at: string
          id: string
          path: string
          session_id: string
          title: string | null
        }
        Insert: {
          duration_seconds?: number
          entered_at?: string
          id?: string
          path: string
          session_id: string
          title?: string | null
        }
        Update: {
          duration_seconds?: number
          entered_at?: string
          id?: string
          path?: string
          session_id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_pageviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "visitor_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_sessions: {
        Row: {
          browser: string | null
          city: string | null
          client_session_id: string
          country: string | null
          country_code: string | null
          device_type: string | null
          duration_seconds: number
          id: string
          ip: string | null
          isp: string | null
          language: string | null
          last_seen_at: string
          latitude: number | null
          longitude: number | null
          os: string | null
          pageview_count: number
          referrer: string | null
          region: string | null
          screen: string | null
          started_at: string
          timezone: string | null
          user_agent: string | null
          who: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          client_session_id: string
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          duration_seconds?: number
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          last_seen_at?: string
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          pageview_count?: number
          referrer?: string | null
          region?: string | null
          screen?: string | null
          started_at?: string
          timezone?: string | null
          user_agent?: string | null
          who?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          client_session_id?: string
          country?: string | null
          country_code?: string | null
          device_type?: string | null
          duration_seconds?: number
          id?: string
          ip?: string | null
          isp?: string | null
          language?: string | null
          last_seen_at?: string
          latitude?: number | null
          longitude?: number | null
          os?: string | null
          pageview_count?: number
          referrer?: string | null
          region?: string | null
          screen?: string | null
          started_at?: string
          timezone?: string | null
          user_agent?: string | null
          who?: string | null
        }
        Relationships: []
      }
      warranty_global_prefs: {
        Row: {
          created_at: string
          id: string
          notify_30: boolean
          notify_60: boolean
          notify_90: boolean
          recipient: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_30?: boolean
          notify_60?: boolean
          notify_90?: boolean
          recipient: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_30?: boolean
          notify_60?: boolean
          notify_90?: boolean
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      weather_notification_prefs: {
        Row: {
          created_at: string
          days_ahead: number
          enabled: boolean
          id: string
          kind: string
          label: string
          last_notified_date: string | null
          last_notified_signature: string | null
          lat: number
          location: string
          lon: number
          notify_hour: number
          notify_minute: number
          recipient: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_ahead?: number
          enabled?: boolean
          id?: string
          kind: string
          label: string
          last_notified_date?: string | null
          last_notified_signature?: string | null
          lat: number
          location: string
          lon: number
          notify_hour?: number
          notify_minute?: number
          recipient?: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_ahead?: number
          enabled?: boolean
          id?: string
          kind?: string
          label?: string
          last_notified_date?: string | null
          last_notified_signature?: string | null
          lat?: number
          location?: string
          lon?: number
          notify_hour?: number
          notify_minute?: number
          recipient?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_db_usage_stats: { Args: never; Returns: Json }
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
