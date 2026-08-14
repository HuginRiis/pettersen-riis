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
          purchased_credits_usd: number
          updated_at: string
        }
        Insert: {
          actual_cost_usd?: number
          created_at?: string
          id?: string
          month: string
          monthly_budget_usd?: number
          note?: string | null
          purchased_credits_usd?: number
          updated_at?: string
        }
        Update: {
          actual_cost_usd?: number
          created_at?: string
          id?: string
          month?: string
          monthly_budget_usd?: number
          note?: string | null
          purchased_credits_usd?: number
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
      air_quality_history: {
        Row: {
          co: number | null
          european_aqi: number | null
          humidity: number | null
          location_key: string
          no2: number | null
          o3: number | null
          pm10: number | null
          pm25: number | null
          precipitation: number | null
          so2: number | null
          temperature: number | null
          ts: string
          wind_speed: number | null
        }
        Insert: {
          co?: number | null
          european_aqi?: number | null
          humidity?: number | null
          location_key: string
          no2?: number | null
          o3?: number | null
          pm10?: number | null
          pm25?: number | null
          precipitation?: number | null
          so2?: number | null
          temperature?: number | null
          ts: string
          wind_speed?: number | null
        }
        Update: {
          co?: number | null
          european_aqi?: number | null
          humidity?: number | null
          location_key?: string
          no2?: number | null
          o3?: number | null
          pm10?: number | null
          pm25?: number | null
          precipitation?: number | null
          so2?: number | null
          temperature?: number | null
          ts?: string
          wind_speed?: number | null
        }
        Relationships: []
      }
      air_quality_notification_prefs: {
        Row: {
          aqi_threshold: number
          cooldown_minutes: number
          created_at: string
          dust_threshold: number
          enabled: boolean
          id: string
          label: string
          last_checked_at: string | null
          last_notified_aqi_at: string | null
          last_notified_dust_at: string | null
          last_notified_no2_at: string | null
          last_notified_o3_at: string | null
          last_notified_pm10_at: string | null
          last_notified_pm25_at: string | null
          last_notified_so2_at: string | null
          lat: number
          location: string
          lon: number
          no2_threshold: number
          notify_aqi: boolean
          notify_dust: boolean
          notify_no2: boolean
          notify_o3: boolean
          notify_pm10: boolean
          notify_pm25: boolean
          notify_so2: boolean
          o3_threshold: number
          pm10_threshold: number
          pm25_threshold: number
          recipient: string
          so2_threshold: number
          updated_at: string
        }
        Insert: {
          aqi_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          dust_threshold?: number
          enabled?: boolean
          id?: string
          label: string
          last_checked_at?: string | null
          last_notified_aqi_at?: string | null
          last_notified_dust_at?: string | null
          last_notified_no2_at?: string | null
          last_notified_o3_at?: string | null
          last_notified_pm10_at?: string | null
          last_notified_pm25_at?: string | null
          last_notified_so2_at?: string | null
          lat: number
          location: string
          lon: number
          no2_threshold?: number
          notify_aqi?: boolean
          notify_dust?: boolean
          notify_no2?: boolean
          notify_o3?: boolean
          notify_pm10?: boolean
          notify_pm25?: boolean
          notify_so2?: boolean
          o3_threshold?: number
          pm10_threshold?: number
          pm25_threshold?: number
          recipient?: string
          so2_threshold?: number
          updated_at?: string
        }
        Update: {
          aqi_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          dust_threshold?: number
          enabled?: boolean
          id?: string
          label?: string
          last_checked_at?: string | null
          last_notified_aqi_at?: string | null
          last_notified_dust_at?: string | null
          last_notified_no2_at?: string | null
          last_notified_o3_at?: string | null
          last_notified_pm10_at?: string | null
          last_notified_pm25_at?: string | null
          last_notified_so2_at?: string | null
          lat?: number
          location?: string
          lon?: number
          no2_threshold?: number
          notify_aqi?: boolean
          notify_dust?: boolean
          notify_no2?: boolean
          notify_o3?: boolean
          notify_pm10?: boolean
          notify_pm25?: boolean
          notify_so2?: boolean
          o3_threshold?: number
          pm10_threshold?: number
          pm25_threshold?: number
          recipient?: string
          so2_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      api_blackout_window: {
        Row: {
          enabled: boolean
          end_time: string
          id: number
          start_time: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          end_time?: string
          id?: number
          start_time?: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          end_time?: string
          id?: number
          start_time?: string
          updated_at?: string
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
      api_pause_flags: {
        Row: {
          end_time: string
          paused: boolean
          source: string
          start_time: string
          updated_at: string
          window_enabled: boolean
        }
        Insert: {
          end_time?: string
          paused?: boolean
          source: string
          start_time?: string
          updated_at?: string
          window_enabled?: boolean
        }
        Update: {
          end_time?: string
          paused?: boolean
          source?: string
          start_time?: string
          updated_at?: string
          window_enabled?: boolean
        }
        Relationships: []
      }
      basseng_climate_samples: {
        Row: {
          outdoor_temp: number | null
          pool_temp: number | null
          ts: string
          watts: number | null
        }
        Insert: {
          outdoor_temp?: number | null
          pool_temp?: number | null
          ts?: string
          watts?: number | null
        }
        Update: {
          outdoor_temp?: number | null
          pool_temp?: number | null
          ts?: string
          watts?: number | null
        }
        Relationships: []
      }
      basseng_notification_prefs: {
        Row: {
          active_from: string
          active_to: string
          created_at: string
          delta: number
          device_match: string
          enabled: boolean
          id: string
          interval_hours: number
          label: string
          last_checked_at: string | null
          last_direction: string | null
          last_notified_at: string | null
          last_notified_value: number | null
          last_value: number | null
          notify_down: boolean
          notify_up: boolean
          recipient_down: string
          recipient_up: string
          trigger_mode: string
          updated_at: string
        }
        Insert: {
          active_from?: string
          active_to?: string
          created_at?: string
          delta?: number
          device_match?: string
          enabled?: boolean
          id?: string
          interval_hours?: number
          label?: string
          last_checked_at?: string | null
          last_direction?: string | null
          last_notified_at?: string | null
          last_notified_value?: number | null
          last_value?: number | null
          notify_down?: boolean
          notify_up?: boolean
          recipient_down?: string
          recipient_up?: string
          trigger_mode?: string
          updated_at?: string
        }
        Update: {
          active_from?: string
          active_to?: string
          created_at?: string
          delta?: number
          device_match?: string
          enabled?: boolean
          id?: string
          interval_hours?: number
          label?: string
          last_checked_at?: string | null
          last_direction?: string | null
          last_notified_at?: string | null
          last_notified_value?: number | null
          last_value?: number | null
          notify_down?: boolean
          notify_up?: boolean
          recipient_down?: string
          recipient_up?: string
          trigger_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      birthdays: {
        Row: {
          birth_date: string
          created_at: string
          id: string
          name: string
          notified_date: string | null
          notified_year: number | null
          notify_days_before: number
          notify_enabled: boolean
          notify_hour: number | null
          notify_minute: number | null
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
          notified_date?: string | null
          notified_year?: number | null
          notify_days_before?: number
          notify_enabled?: boolean
          notify_hour?: number | null
          notify_minute?: number | null
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
          notified_date?: string | null
          notified_year?: number | null
          notify_days_before?: number
          notify_enabled?: boolean
          notify_hour?: number | null
          notify_minute?: number | null
          notify_recipients?: string[]
          title?: string | null
          updated_at?: string
          words?: string | null
        }
        Relationships: []
      }
      car_trips: {
        Row: {
          avg_speed_kmh: number | null
          created_at: string
          distance_km: number
          duration_min: number | null
          efficiency_kwh_100km: number | null
          end_lat: number | null
          end_lon: number | null
          end_place: string | null
          end_ts: string | null
          energy_regen_kwh: number | null
          id: string
          start_lat: number | null
          start_lon: number | null
          start_place: string | null
          start_ts: string
          vehicle: string
        }
        Insert: {
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number
          duration_min?: number | null
          efficiency_kwh_100km?: number | null
          end_lat?: number | null
          end_lon?: number | null
          end_place?: string | null
          end_ts?: string | null
          energy_regen_kwh?: number | null
          id?: string
          start_lat?: number | null
          start_lon?: number | null
          start_place?: string | null
          start_ts: string
          vehicle?: string
        }
        Update: {
          avg_speed_kmh?: number | null
          created_at?: string
          distance_km?: number
          duration_min?: number | null
          efficiency_kwh_100km?: number | null
          end_lat?: number | null
          end_lon?: number | null
          end_place?: string | null
          end_ts?: string | null
          energy_regen_kwh?: number | null
          id?: string
          start_lat?: number | null
          start_lon?: number | null
          start_place?: string | null
          start_ts?: string
          vehicle?: string
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
      climate_notification_prefs: {
        Row: {
          cold_threshold: number
          cooldown_minutes: number
          enabled: boolean
          hot_threshold: number
          id: string
          label: string
          last_checked_at: string | null
          last_notified_cold_at: string | null
          last_notified_hot_at: string | null
          last_value: number | null
          module_match: string | null
          notify_cold: boolean
          notify_hot: boolean
          recipient: string
          room_key: string
          station_match: string
          updated_at: string
        }
        Insert: {
          cold_threshold?: number
          cooldown_minutes?: number
          enabled?: boolean
          hot_threshold?: number
          id?: string
          label: string
          last_checked_at?: string | null
          last_notified_cold_at?: string | null
          last_notified_hot_at?: string | null
          last_value?: number | null
          module_match?: string | null
          notify_cold?: boolean
          notify_hot?: boolean
          recipient?: string
          room_key: string
          station_match: string
          updated_at?: string
        }
        Update: {
          cold_threshold?: number
          cooldown_minutes?: number
          enabled?: boolean
          hot_threshold?: number
          id?: string
          label?: string
          last_checked_at?: string | null
          last_notified_cold_at?: string | null
          last_notified_hot_at?: string | null
          last_value?: number | null
          module_match?: string | null
          notify_cold?: boolean
          notify_hot?: boolean
          recipient?: string
          room_key?: string
          station_match?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_power_samples: {
        Row: {
          device_id: string
          ts: string
          watts: number
        }
        Insert: {
          device_id: string
          ts?: string
          watts: number
        }
        Update: {
          device_id?: string
          ts?: string
          watts?: number
        }
        Relationships: []
      }
      flights_seen: {
        Row: {
          callsign: string | null
          first_seen: string
          icao24: string
          last_notified_at: string | null
          last_notified_distance_km: number | null
          last_seen: string
          location: string
          origin_country: string | null
        }
        Insert: {
          callsign?: string | null
          first_seen?: string
          icao24: string
          last_notified_at?: string | null
          last_notified_distance_km?: number | null
          last_seen?: string
          location?: string
          origin_country?: string | null
        }
        Update: {
          callsign?: string | null
          first_seen?: string
          icao24?: string
          last_notified_at?: string | null
          last_notified_distance_km?: number | null
          last_seen?: string
          location?: string
          origin_country?: string | null
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
      gardena_auth: {
        Row: {
          access_token: string | null
          expires_at: string | null
          id: number
          refresh_token: string | null
          token_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          expires_at?: string | null
          id?: number
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          expires_at?: string | null
          id?: number
          refresh_token?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      gardena_snapshot: {
        Row: {
          cache_key: string
          data: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          data: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      garmin_activities: {
        Row: {
          activity_name: string | null
          activity_type: string | null
          average_hr: number | null
          average_speed: number | null
          calories: number | null
          created_at: string
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain: number | null
          garmin_activity_id: number
          id: string
          max_hr: number | null
          owner: string
          raw: Json | null
          start_time_local: string
          updated_at: string
        }
        Insert: {
          activity_name?: string | null
          activity_type?: string | null
          average_hr?: number | null
          average_speed?: number | null
          calories?: number | null
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          garmin_activity_id: number
          id?: string
          max_hr?: number | null
          owner?: string
          raw?: Json | null
          start_time_local: string
          updated_at?: string
        }
        Update: {
          activity_name?: string | null
          activity_type?: string | null
          average_hr?: number | null
          average_speed?: number | null
          calories?: number | null
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain?: number | null
          garmin_activity_id?: number
          id?: string
          max_hr?: number | null
          owner?: string
          raw?: Json | null
          start_time_local?: string
          updated_at?: string
        }
        Relationships: []
      }
      garmin_daily_stats: {
        Row: {
          active_kilocalories: number | null
          average_heart_rate: number | null
          body_battery_high: number | null
          body_battery_low: number | null
          created_at: string
          day: string
          distance_meters: number | null
          endurance_contributors: Json | null
          endurance_score: number | null
          fitness_age: number | null
          floors_climbed: number | null
          floors_goal: number | null
          id: string
          intensity_minutes_goal: number | null
          moderate_intensity_minutes: number | null
          owner: string
          raw: Json | null
          resting_heart_rate: number | null
          step_goal: number | null
          steps: number | null
          stress_average: number | null
          total_kilocalories: number | null
          training_load_focus: Json | null
          training_status: string | null
          updated_at: string
          vigorous_intensity_minutes: number | null
          vo2max_cycling: number | null
          vo2max_running: number | null
          weight_kg: number | null
        }
        Insert: {
          active_kilocalories?: number | null
          average_heart_rate?: number | null
          body_battery_high?: number | null
          body_battery_low?: number | null
          created_at?: string
          day: string
          distance_meters?: number | null
          endurance_contributors?: Json | null
          endurance_score?: number | null
          fitness_age?: number | null
          floors_climbed?: number | null
          floors_goal?: number | null
          id?: string
          intensity_minutes_goal?: number | null
          moderate_intensity_minutes?: number | null
          owner?: string
          raw?: Json | null
          resting_heart_rate?: number | null
          step_goal?: number | null
          steps?: number | null
          stress_average?: number | null
          total_kilocalories?: number | null
          training_load_focus?: Json | null
          training_status?: string | null
          updated_at?: string
          vigorous_intensity_minutes?: number | null
          vo2max_cycling?: number | null
          vo2max_running?: number | null
          weight_kg?: number | null
        }
        Update: {
          active_kilocalories?: number | null
          average_heart_rate?: number | null
          body_battery_high?: number | null
          body_battery_low?: number | null
          created_at?: string
          day?: string
          distance_meters?: number | null
          endurance_contributors?: Json | null
          endurance_score?: number | null
          fitness_age?: number | null
          floors_climbed?: number | null
          floors_goal?: number | null
          id?: string
          intensity_minutes_goal?: number | null
          moderate_intensity_minutes?: number | null
          owner?: string
          raw?: Json | null
          resting_heart_rate?: number | null
          step_goal?: number | null
          steps?: number | null
          stress_average?: number | null
          total_kilocalories?: number | null
          training_load_focus?: Json | null
          training_status?: string | null
          updated_at?: string
          vigorous_intensity_minutes?: number | null
          vo2max_cycling?: number | null
          vo2max_running?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      garmin_devices: {
        Row: {
          created_at: string
          id: string
          image_transparent_url: string | null
          image_url: string | null
          is_default: boolean
          last_used_at: string | null
          name: string
          owner: string
          product_id: string
          raw: Json | null
          register_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_transparent_url?: string | null
          image_url?: string | null
          is_default?: boolean
          last_used_at?: string | null
          name: string
          owner?: string
          product_id: string
          raw?: Json | null
          register_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_transparent_url?: string | null
          image_url?: string | null
          is_default?: boolean
          last_used_at?: string | null
          name?: string
          owner?: string
          product_id?: string
          raw?: Json | null
          register_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      garmin_intraday: {
        Row: {
          body_battery: number | null
          day: string
          heart_rate_avg: number | null
          heart_rate_max: number | null
          hour: number
          owner: string
          stress_avg: number | null
          updated_at: string
        }
        Insert: {
          body_battery?: number | null
          day: string
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          hour: number
          owner?: string
          stress_avg?: number | null
          updated_at?: string
        }
        Update: {
          body_battery?: number | null
          day?: string
          heart_rate_avg?: number | null
          heart_rate_max?: number | null
          hour?: number
          owner?: string
          stress_avg?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      garmin_notification_prefs: {
        Row: {
          compare_fields: string[]
          compare_time: string
          created_at: string
          daily_fields: string[]
          daily_show_both: boolean
          daily_time: string
          enabled: boolean
          garmin_owner: string
          high_rhr_bpm: number
          id: string
          low_sleep_hours: number
          no_sync_check_time: string
          no_sync_hours: number
          notified_keys: string[]
          notify_compare: boolean
          notify_daily: boolean
          notify_high_resting_hr: boolean
          notify_low_sleep: boolean
          notify_no_sync: boolean
          notify_step_goal: boolean
          recipient: string
          sender_label: string
          updated_at: string
        }
        Insert: {
          compare_fields?: string[]
          compare_time?: string
          created_at?: string
          daily_fields?: string[]
          daily_show_both?: boolean
          daily_time?: string
          enabled?: boolean
          garmin_owner?: string
          high_rhr_bpm?: number
          id?: string
          low_sleep_hours?: number
          no_sync_check_time?: string
          no_sync_hours?: number
          notified_keys?: string[]
          notify_compare?: boolean
          notify_daily?: boolean
          notify_high_resting_hr?: boolean
          notify_low_sleep?: boolean
          notify_no_sync?: boolean
          notify_step_goal?: boolean
          recipient?: string
          sender_label?: string
          updated_at?: string
        }
        Update: {
          compare_fields?: string[]
          compare_time?: string
          created_at?: string
          daily_fields?: string[]
          daily_show_both?: boolean
          daily_time?: string
          enabled?: boolean
          garmin_owner?: string
          high_rhr_bpm?: number
          id?: string
          low_sleep_hours?: number
          no_sync_check_time?: string
          no_sync_hours?: number
          notified_keys?: string[]
          notify_compare?: boolean
          notify_daily?: boolean
          notify_high_resting_hr?: boolean
          notify_low_sleep?: boolean
          notify_no_sync?: boolean
          notify_step_goal?: boolean
          recipient?: string
          sender_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      garmin_sleep: {
        Row: {
          average_respiration: number | null
          average_spo2: number | null
          awake_seconds: number | null
          created_at: string
          day: string
          deep_seconds: number | null
          hrv_avg: number | null
          id: string
          light_seconds: number | null
          owner: string
          raw: Json | null
          rem_seconds: number | null
          sleep_end: string | null
          sleep_score: number | null
          sleep_start: string | null
          total_seconds: number | null
          updated_at: string
        }
        Insert: {
          average_respiration?: number | null
          average_spo2?: number | null
          awake_seconds?: number | null
          created_at?: string
          day: string
          deep_seconds?: number | null
          hrv_avg?: number | null
          id?: string
          light_seconds?: number | null
          owner?: string
          raw?: Json | null
          rem_seconds?: number | null
          sleep_end?: string | null
          sleep_score?: number | null
          sleep_start?: string | null
          total_seconds?: number | null
          updated_at?: string
        }
        Update: {
          average_respiration?: number | null
          average_spo2?: number | null
          awake_seconds?: number | null
          created_at?: string
          day?: string
          deep_seconds?: number | null
          hrv_avg?: number | null
          id?: string
          light_seconds?: number | null
          owner?: string
          raw?: Json | null
          rem_seconds?: number | null
          sleep_end?: string | null
          sleep_score?: number | null
          sleep_start?: string | null
          total_seconds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      garmin_sync_log: {
        Row: {
          activities_count: number | null
          daily_count: number | null
          duration_ms: number | null
          error: string | null
          id: string
          ok: boolean
          owner: string
          ran_at: string
          sleep_count: number | null
          trigger: string
        }
        Insert: {
          activities_count?: number | null
          daily_count?: number | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok: boolean
          owner?: string
          ran_at?: string
          sleep_count?: number | null
          trigger: string
        }
        Update: {
          activities_count?: number | null
          daily_count?: number | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          ok?: boolean
          owner?: string
          ran_at?: string
          sleep_count?: number | null
          trigger?: string
        }
        Relationships: []
      }
      garmin_threshold_prefs: {
        Row: {
          cooldown_hours: number
          created_at: string
          direction: string
          enabled: boolean
          garmin_owner: string
          id: string
          label: string | null
          last_notified_at: string | null
          last_value: number | null
          metric: string
          recipient: string
          sender_label: string
          threshold: number
          updated_at: string
        }
        Insert: {
          cooldown_hours?: number
          created_at?: string
          direction?: string
          enabled?: boolean
          garmin_owner?: string
          id?: string
          label?: string | null
          last_notified_at?: string | null
          last_value?: number | null
          metric: string
          recipient?: string
          sender_label?: string
          threshold: number
          updated_at?: string
        }
        Update: {
          cooldown_hours?: number
          created_at?: string
          direction?: string
          enabled?: boolean
          garmin_owner?: string
          id?: string
          label?: string | null
          last_notified_at?: string | null
          last_value?: number | null
          metric?: string
          recipient?: string
          sender_label?: string
          threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      garmin_tokens: {
        Row: {
          created_at: string
          device_image_transparent_url: string | null
          device_image_url: string | null
          device_name: string | null
          device_product_id: string | null
          device_updated_at: string | null
          domain: string
          id: string
          last_login_at: string | null
          oauth1_secret: string | null
          oauth1_token: string | null
          oauth2_expires_at: string | null
          oauth2_refresh_token: string | null
          oauth2_token: string | null
          owner: string
          pending_mfa: Json | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          device_image_transparent_url?: string | null
          device_image_url?: string | null
          device_name?: string | null
          device_product_id?: string | null
          device_updated_at?: string | null
          domain?: string
          id?: string
          last_login_at?: string | null
          oauth1_secret?: string | null
          oauth1_token?: string | null
          oauth2_expires_at?: string | null
          oauth2_refresh_token?: string | null
          oauth2_token?: string | null
          owner?: string
          pending_mfa?: Json | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          device_image_transparent_url?: string | null
          device_image_url?: string | null
          device_name?: string | null
          device_product_id?: string | null
          device_updated_at?: string | null
          domain?: string
          id?: string
          last_login_at?: string | null
          oauth1_secret?: string | null
          oauth1_token?: string | null
          oauth2_expires_at?: string | null
          oauth2_refresh_token?: string | null
          oauth2_token?: string | null
          owner?: string
          pending_mfa?: Json | null
          updated_at?: string
          username?: string | null
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
      homey_sensor_events: {
        Row: {
          capability_id: string
          device_id: string
          device_name: string | null
          event_type: string
          id: string
          kind: string
          ts: string
          value: string | null
          zone: string | null
        }
        Insert: {
          capability_id: string
          device_id: string
          device_name?: string | null
          event_type: string
          id?: string
          kind: string
          ts?: string
          value?: string | null
          zone?: string | null
        }
        Update: {
          capability_id?: string
          device_id?: string
          device_name?: string | null
          event_type?: string
          id?: string
          kind?: string
          ts?: string
          value?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      homey_sensor_state: {
        Row: {
          capability_id: string
          device_id: string
          device_name: string | null
          kind: string
          last_seen: string
          last_ts: string
          last_value: string | null
          zone: string | null
        }
        Insert: {
          capability_id: string
          device_id: string
          device_name?: string | null
          kind: string
          last_seen?: string
          last_ts?: string
          last_value?: string | null
          zone?: string | null
        }
        Update: {
          capability_id?: string
          device_id?: string
          device_name?: string | null
          kind?: string
          last_seen?: string
          last_ts?: string
          last_value?: string | null
          zone?: string | null
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
          repeat_interval_days: number | null
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
          repeat_interval_days?: number | null
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
          repeat_interval_days?: number | null
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
      linketur_state: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data?: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          added_by: string
          created_at: string
          direction: string
          expected_return: string | null
          id: string
          image_path: string | null
          image_url: string | null
          item: string
          lent_at: string
          notes: string | null
          overdue_notified_at: string | null
          person: string
          recipient: string
          reminder_sent_at: string | null
          returned_at: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string
          created_at?: string
          direction: string
          expected_return?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          item: string
          lent_at?: string
          notes?: string | null
          overdue_notified_at?: string | null
          person: string
          recipient?: string
          reminder_sent_at?: string | null
          returned_at?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string
          created_at?: string
          direction?: string
          expected_return?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          item?: string
          lent_at?: string
          notes?: string | null
          overdue_notified_at?: string | null
          person?: string
          recipient?: string
          reminder_sent_at?: string | null
          returned_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      login_notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notify_on_failure: boolean
          notify_on_success: boolean
          recipient: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          notify_on_failure?: boolean
          notify_on_success?: boolean
          recipient?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notify_on_failure?: boolean
          notify_on_success?: boolean
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      mail_delivery_prefs: {
        Row: {
          created_at: string
          days_before: number
          enabled: boolean
          id: string
          last_notified_for_date: string | null
          notify_hour: number
          notify_minute: number
          postal_code: string
          recipient: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          id?: string
          last_notified_for_date?: string | null
          notify_hour?: number
          notify_minute?: number
          postal_code?: string
          recipient?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_before?: number
          enabled?: boolean
          id?: string
          last_notified_for_date?: string | null
          notify_hour?: number
          notify_minute?: number
          postal_code?: string
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      manuals: {
        Row: {
          added_by: string | null
          brand: string | null
          category: string | null
          created_at: string
          file_path: string | null
          file_size: number | null
          id: string
          model: string | null
          notes: string | null
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          model?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          brand?: string | null
          category?: string | null
          created_at?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          model?: string | null
          notes?: string | null
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      met_alert_notification_prefs: {
        Row: {
          colors: string[]
          counties: string[]
          created_at: string
          enabled: boolean
          event_types: string[]
          id: string
          min_color: string
          notified_alert_ids: string[]
          recipient: string
          updated_at: string
        }
        Insert: {
          colors?: string[]
          counties?: string[]
          created_at?: string
          enabled?: boolean
          event_types?: string[]
          id?: string
          min_color?: string
          notified_alert_ids?: string[]
          recipient?: string
          updated_at?: string
        }
        Update: {
          colors?: string[]
          counties?: string[]
          created_at?: string
          enabled?: boolean
          event_types?: string[]
          id?: string
          min_color?: string
          notified_alert_ids?: string[]
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      netatmo_climate_snapshot: {
        Row: {
          cache_key: string
          data: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          data: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      nsm_alerts: {
        Row: {
          created_at: string
          external_id: string
          fetched_at: string
          id: string
          notified: boolean
          published_at: string | null
          summary: string | null
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          external_id: string
          fetched_at?: string
          id?: string
          notified?: boolean
          published_at?: string | null
          summary?: string | null
          title: string
          url: string
        }
        Update: {
          created_at?: string
          external_id?: string
          fetched_at?: string
          id?: string
          notified?: boolean
          published_at?: string | null
          summary?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      nsm_notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          recipient: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          recipient: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          recipient?: string
          updated_at?: string
        }
        Relationships: []
      }
      page_load_log: {
        Row: {
          browser: string | null
          device: string | null
          dom_ms: number | null
          id: string
          kind: string
          load_ms: number
          loaded_at: string
          os: string | null
          route: string
          ttfb_ms: number | null
          user_agent: string | null
          who: string
        }
        Insert: {
          browser?: string | null
          device?: string | null
          dom_ms?: number | null
          id?: string
          kind?: string
          load_ms: number
          loaded_at?: string
          os?: string | null
          route: string
          ttfb_ms?: number | null
          user_agent?: string | null
          who?: string
        }
        Update: {
          browser?: string | null
          device?: string | null
          dom_ms?: number | null
          id?: string
          kind?: string
          load_ms?: number
          loaded_at?: string
          os?: string | null
          route?: string
          ttfb_ms?: number | null
          user_agent?: string | null
          who?: string
        }
        Relationships: []
      }
      payslip_files: {
        Row: {
          employer: string | null
          extracted_at: string | null
          extracted_text: string | null
          file_path: string
          file_url: string
          id: string
          mime_type: string | null
          month: number | null
          original_name: string | null
          profile: string
          size_bytes: number | null
          uploaded_at: string
          year: number
        }
        Insert: {
          employer?: string | null
          extracted_at?: string | null
          extracted_text?: string | null
          file_path: string
          file_url: string
          id?: string
          mime_type?: string | null
          month?: number | null
          original_name?: string | null
          profile?: string
          size_bytes?: number | null
          uploaded_at?: string
          year: number
        }
        Update: {
          employer?: string | null
          extracted_at?: string | null
          extracted_text?: string | null
          file_path?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          month?: number | null
          original_name?: string | null
          profile?: string
          size_bytes?: number | null
          uploaded_at?: string
          year?: number
        }
        Relationships: []
      }
      plant_notification_log: {
        Row: {
          detail: string | null
          id: string
          kind: string
          notified_at: string
          plant_id: string
        }
        Insert: {
          detail?: string | null
          id?: string
          kind: string
          notified_at?: string
          plant_id: string
        }
        Update: {
          detail?: string | null
          id?: string
          kind?: string
          notified_at?: string
          plant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_notification_log_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      plant_photos: {
        Row: {
          created_at: string
          id: string
          is_ai_generated: boolean
          lat: number | null
          location_label: string | null
          lon: number | null
          notes: string | null
          photo_url: string
          plant_id: string
          taken_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          lat?: number | null
          location_label?: string | null
          lon?: number | null
          notes?: string | null
          photo_url: string
          plant_id: string
          taken_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          lat?: number | null
          location_label?: string | null
          lon?: number | null
          notes?: string | null
          photo_url?: string
          plant_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plant_photos_plant_id_fkey"
            columns: ["plant_id"]
            isOneToOne: false
            referencedRelation: "plants"
            referencedColumns: ["id"]
          },
        ]
      }
      plants: {
        Row: {
          ai_raw: Json | null
          ai_reference_image_url: string | null
          care_summary: string | null
          cover_photo_url: string | null
          created_at: string
          edible: boolean | null
          fertility_min: number | null
          fertilize_weeks_interval: number | null
          id: string
          kind: string
          last_fertilized_at: string | null
          last_watered_at: string | null
          light_lux_min: number | null
          miflora_device_id: string | null
          miflora_device_name: string | null
          name: string
          notify_fertilize: boolean
          notify_recipient: string
          notify_season: boolean
          notify_sensor: boolean
          notify_watering: boolean
          season_end_month: number | null
          season_start_month: number | null
          soil_moisture_max: number | null
          soil_moisture_min: number | null
          sort_order: number
          species_common: string | null
          species_latin: string | null
          temp_max: number | null
          temp_min: number | null
          toxicity: string
          toxicity_notes: string | null
          updated_at: string
          watering_days_interval: number | null
          where_grows: string | null
        }
        Insert: {
          ai_raw?: Json | null
          ai_reference_image_url?: string | null
          care_summary?: string | null
          cover_photo_url?: string | null
          created_at?: string
          edible?: boolean | null
          fertility_min?: number | null
          fertilize_weeks_interval?: number | null
          id?: string
          kind?: string
          last_fertilized_at?: string | null
          last_watered_at?: string | null
          light_lux_min?: number | null
          miflora_device_id?: string | null
          miflora_device_name?: string | null
          name: string
          notify_fertilize?: boolean
          notify_recipient?: string
          notify_season?: boolean
          notify_sensor?: boolean
          notify_watering?: boolean
          season_end_month?: number | null
          season_start_month?: number | null
          soil_moisture_max?: number | null
          soil_moisture_min?: number | null
          sort_order?: number
          species_common?: string | null
          species_latin?: string | null
          temp_max?: number | null
          temp_min?: number | null
          toxicity?: string
          toxicity_notes?: string | null
          updated_at?: string
          watering_days_interval?: number | null
          where_grows?: string | null
        }
        Update: {
          ai_raw?: Json | null
          ai_reference_image_url?: string | null
          care_summary?: string | null
          cover_photo_url?: string | null
          created_at?: string
          edible?: boolean | null
          fertility_min?: number | null
          fertilize_weeks_interval?: number | null
          id?: string
          kind?: string
          last_fertilized_at?: string | null
          last_watered_at?: string | null
          light_lux_min?: number | null
          miflora_device_id?: string | null
          miflora_device_name?: string | null
          name?: string
          notify_fertilize?: boolean
          notify_recipient?: string
          notify_season?: boolean
          notify_sensor?: boolean
          notify_watering?: boolean
          season_end_month?: number | null
          season_start_month?: number | null
          soil_moisture_max?: number | null
          soil_moisture_min?: number | null
          sort_order?: number
          species_common?: string | null
          species_latin?: string | null
          temp_max?: number | null
          temp_min?: number | null
          toxicity?: string
          toxicity_notes?: string | null
          updated_at?: string
          watering_days_interval?: number | null
          where_grows?: string | null
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
      push_quiet_hours: {
        Row: {
          enabled: boolean
          recipient: string
          updated_at: string
          weekday_end: string
          weekday_start: string
          weekend_end: string
          weekend_start: string
        }
        Insert: {
          enabled?: boolean
          recipient: string
          updated_at?: string
          weekday_end?: string
          weekday_start?: string
          weekend_end?: string
          weekend_start?: string
        }
        Update: {
          enabled?: boolean
          recipient?: string
          updated_at?: string
          weekday_end?: string
          weekday_start?: string
          weekend_end?: string
          weekend_start?: string
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
      roborock_auth: {
        Row: {
          base_url: string | null
          country: string | null
          country_code: string | null
          device_id: string
          email: string
          id: number
          rriot: Json | null
          token: string | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          country?: string | null
          country_code?: string | null
          device_id: string
          email: string
          id?: number
          rriot?: Json | null
          token?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          country?: string | null
          country_code?: string | null
          device_id?: string
          email?: string
          id?: number
          rriot?: Json | null
          token?: string | null
          updated_at?: string
        }
        Relationships: []
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
      strava_dashboard_cache: {
        Row: {
          data: Json
          fetched_at: string
          owner: string
        }
        Insert: {
          data: Json
          fetched_at?: string
          owner: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          owner?: string
        }
        Relationships: []
      }
      tax_monthly: {
        Row: {
          ekstra: number
          employer: string
          id: string
          lonn: number
          month: number
          profile: string
          skatt: number
          source: string | null
          updated_at: string
          year: number
        }
        Insert: {
          ekstra?: number
          employer?: string
          id?: string
          lonn?: number
          month: number
          profile?: string
          skatt?: number
          source?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          ekstra?: number
          employer?: string
          id?: string
          lonn?: number
          month?: number
          profile?: string
          skatt?: number
          source?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      tax_year_settings: {
        Row: {
          ekstra_pr_mnd: number
          profile: string
          skal_betale: number
          updated_at: string
          year: number
        }
        Insert: {
          ekstra_pr_mnd?: number
          profile?: string
          skal_betale?: number
          updated_at?: string
          year: number
        }
        Update: {
          ekstra_pr_mnd?: number
          profile?: string
          skal_betale?: number
          updated_at?: string
          year?: number
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
      tibber_notification_log: {
        Row: {
          id: string
          location: string
          notified_at: string
          notified_for_date: string
        }
        Insert: {
          id?: string
          location: string
          notified_at?: string
          notified_for_date: string
        }
        Update: {
          id?: string
          location?: string
          notified_at?: string
          notified_for_date?: string
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
      user_light_scenes: {
        Row: {
          created_at: string
          device_ids: string[]
          device_levels: Json
          id: string
          name: string
          slot: number
          updated_at: string
          who: string
        }
        Insert: {
          created_at?: string
          device_ids?: string[]
          device_levels?: Json
          id?: string
          name?: string
          slot: number
          updated_at?: string
          who: string
        }
        Update: {
          created_at?: string
          device_ids?: string[]
          device_levels?: Json
          id?: string
          name?: string
          slot?: number
          updated_at?: string
          who?: string
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
      user_menu_prefs: {
        Row: {
          created_at: string
          favorite_zones: string[]
          favorites: string[]
          favorites_enabled: boolean
          id: string
          menu_folders: Json
          sort_by_usage: boolean
          updated_at: string
          use_global_light_scenes: boolean
          who: string
        }
        Insert: {
          created_at?: string
          favorite_zones?: string[]
          favorites?: string[]
          favorites_enabled?: boolean
          id?: string
          menu_folders?: Json
          sort_by_usage?: boolean
          updated_at?: string
          use_global_light_scenes?: boolean
          who: string
        }
        Update: {
          created_at?: string
          favorite_zones?: string[]
          favorites?: string[]
          favorites_enabled?: boolean
          id?: string
          menu_folders?: Json
          sort_by_usage?: boolean
          updated_at?: string
          use_global_light_scenes?: boolean
          who?: string
        }
        Relationships: []
      }
      uv_notification_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          fall_recipient: string
          id: string
          label: string
          lat: number
          lead_minutes: number
          location: string
          lon: number
          notified_date_3: string | null
          notified_date_6: string | null
          notified_date_8: string | null
          notified_fall_date_3: string | null
          notified_fall_date_6: string | null
          notified_fall_date_8: string | null
          notified_peak_clear_date: string | null
          notified_peak_cloud_date: string | null
          notify_fall_3: boolean
          notify_fall_6: boolean
          notify_fall_8: boolean
          notify_peak_clear: boolean
          notify_peak_cloud: boolean
          notify_rise_3: boolean
          notify_rise_6: boolean
          notify_rise_8: boolean
          reached_date_3: string | null
          reached_date_6: string | null
          reached_date_8: string | null
          recipient: string
          updated_at: string
          uv_source: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          fall_recipient?: string
          id?: string
          label: string
          lat: number
          lead_minutes?: number
          location: string
          lon: number
          notified_date_3?: string | null
          notified_date_6?: string | null
          notified_date_8?: string | null
          notified_fall_date_3?: string | null
          notified_fall_date_6?: string | null
          notified_fall_date_8?: string | null
          notified_peak_clear_date?: string | null
          notified_peak_cloud_date?: string | null
          notify_fall_3?: boolean
          notify_fall_6?: boolean
          notify_fall_8?: boolean
          notify_peak_clear?: boolean
          notify_peak_cloud?: boolean
          notify_rise_3?: boolean
          notify_rise_6?: boolean
          notify_rise_8?: boolean
          reached_date_3?: string | null
          reached_date_6?: string | null
          reached_date_8?: string | null
          recipient?: string
          updated_at?: string
          uv_source?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          fall_recipient?: string
          id?: string
          label?: string
          lat?: number
          lead_minutes?: number
          location?: string
          lon?: number
          notified_date_3?: string | null
          notified_date_6?: string | null
          notified_date_8?: string | null
          notified_fall_date_3?: string | null
          notified_fall_date_6?: string | null
          notified_fall_date_8?: string | null
          notified_peak_clear_date?: string | null
          notified_peak_cloud_date?: string | null
          notify_fall_3?: boolean
          notify_fall_6?: boolean
          notify_fall_8?: boolean
          notify_peak_clear?: boolean
          notify_peak_cloud?: boolean
          notify_rise_3?: boolean
          notify_rise_6?: boolean
          notify_rise_8?: boolean
          reached_date_3?: string | null
          reached_date_6?: string | null
          reached_date_8?: string | null
          recipient?: string
          updated_at?: string
          uv_source?: string
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
      weather_summary_push_prefs: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          include_precip: boolean
          include_summary: boolean
          include_sunrise_sunset: boolean
          include_symbol: boolean
          include_temp_range: boolean
          include_uv: boolean
          include_wind: boolean
          last_sent_slot1_date: string | null
          last_sent_slot2_date: string | null
          slot1_enabled: boolean
          slot1_hour: number
          slot1_minute: number
          slot1_target: string
          slot2_enabled: boolean
          slot2_hour: number
          slot2_minute: number
          slot2_target: string
          updated_at: string
          who: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_precip?: boolean
          include_summary?: boolean
          include_sunrise_sunset?: boolean
          include_symbol?: boolean
          include_temp_range?: boolean
          include_uv?: boolean
          include_wind?: boolean
          last_sent_slot1_date?: string | null
          last_sent_slot2_date?: string | null
          slot1_enabled?: boolean
          slot1_hour?: number
          slot1_minute?: number
          slot1_target?: string
          slot2_enabled?: boolean
          slot2_hour?: number
          slot2_minute?: number
          slot2_target?: string
          updated_at?: string
          who: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          include_precip?: boolean
          include_summary?: boolean
          include_sunrise_sunset?: boolean
          include_symbol?: boolean
          include_temp_range?: boolean
          include_uv?: boolean
          include_wind?: boolean
          last_sent_slot1_date?: string | null
          last_sent_slot2_date?: string | null
          slot1_enabled?: boolean
          slot1_hour?: number
          slot1_minute?: number
          slot1_target?: string
          slot2_enabled?: boolean
          slot2_hour?: number
          slot2_minute?: number
          slot2_target?: string
          updated_at?: string
          who?: string
        }
        Relationships: []
      }
      web_favorites: {
        Row: {
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
          updated_at: string
          url: string
          who: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
          url: string
          who?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          url?: string
          who?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_pgnet_cache: { Args: never; Returns: Json }
      get_api_call_hourly_24h: { Args: never; Returns: Json }
      get_api_call_summary_24h: { Args: never; Returns: Json }
      get_cron_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      get_db_30day_cleanup_estimate: { Args: never; Returns: Json }
      get_db_detail_stats: { Args: never; Returns: Json }
      get_db_usage_stats: { Args: never; Returns: Json }
      get_pgnet_cache_size: { Args: never; Returns: Json }
      get_storage_usage_stats: { Args: never; Returns: Json }
      get_table_bytes: { Args: { _table: string }; Returns: number }
      reclaim_space: { Args: never; Returns: Json }
      run_db_30day_cleanup: { Args: never; Returns: Json }
      set_cron_job_active: {
        Args: { _active: boolean; _jobname: string }
        Returns: boolean
      }
      set_cron_job_config: {
        Args: { p_jobid: number; p_minutes?: number; p_mode: string }
        Returns: undefined
      }
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
