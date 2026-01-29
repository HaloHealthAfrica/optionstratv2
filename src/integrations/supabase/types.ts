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
      adapter_logs: {
        Row: {
          adapter_name: string
          correlation_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          http_status_code: number | null
          id: string
          operation: string
          order_id: string | null
          request_payload: Json | null
          response_payload: Json | null
          status: string | null
        }
        Insert: {
          adapter_name: string
          correlation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          http_status_code?: number | null
          id?: string
          operation: string
          order_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string | null
        }
        Update: {
          adapter_name?: string
          correlation_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          http_status_code?: number | null
          id?: string
          operation?: string
          order_id?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adapter_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      confluence_scores: {
        Row: {
          bearish_sources: number | null
          bullish_sources: number | null
          conflict_details: string | null
          context_score: number | null
          context_weight: number | null
          created_at: string | null
          direction_consensus: string | null
          evaluation_timestamp: string | null
          gex_score: number | null
          gex_weight: number | null
          has_conflict: boolean | null
          id: string
          mtf_score: number | null
          mtf_weight: number | null
          neutral_sources: number | null
          positioning_score: number | null
          positioning_weight: number | null
          ticker: string
          tv_score: number | null
          tv_weight: number | null
          weighted_confluence: number | null
        }
        Insert: {
          bearish_sources?: number | null
          bullish_sources?: number | null
          conflict_details?: string | null
          context_score?: number | null
          context_weight?: number | null
          created_at?: string | null
          direction_consensus?: string | null
          evaluation_timestamp?: string | null
          gex_score?: number | null
          gex_weight?: number | null
          has_conflict?: boolean | null
          id?: string
          mtf_score?: number | null
          mtf_weight?: number | null
          neutral_sources?: number | null
          positioning_score?: number | null
          positioning_weight?: number | null
          ticker: string
          tv_score?: number | null
          tv_weight?: number | null
          weighted_confluence?: number | null
        }
        Update: {
          bearish_sources?: number | null
          bullish_sources?: number | null
          conflict_details?: string | null
          context_score?: number | null
          context_weight?: number | null
          created_at?: string | null
          direction_consensus?: string | null
          evaluation_timestamp?: string | null
          gex_score?: number | null
          gex_weight?: number | null
          has_conflict?: boolean | null
          id?: string
          mtf_score?: number | null
          mtf_weight?: number | null
          neutral_sources?: number | null
          positioning_score?: number | null
          positioning_weight?: number | null
          ticker?: string
          tv_score?: number | null
          tv_weight?: number | null
          weighted_confluence?: number | null
        }
        Relationships: []
      }
      decision_log: {
        Row: {
          action: string
          action_reason: string | null
          confidence: number | null
          conflict_resolution: Json | null
          confluence_score: Json | null
          context_snapshot: Json
          created_at: string | null
          decision_timestamp: string | null
          decision_type: string
          gex_signals: Json | null
          id: string
          market_context: Json | null
          mtf_trend: Json | null
          outcome_correct: boolean | null
          outcome_pnl: number | null
          outcome_timestamp: string | null
          position_sizing: Json | null
          positioning: Json | null
          price: number | null
          quantity: number | null
          regime_stability: Json | null
          rules_triggered: Json | null
          ticker: string
          tv_signal: Json | null
        }
        Insert: {
          action: string
          action_reason?: string | null
          confidence?: number | null
          conflict_resolution?: Json | null
          confluence_score?: Json | null
          context_snapshot: Json
          created_at?: string | null
          decision_timestamp?: string | null
          decision_type: string
          gex_signals?: Json | null
          id?: string
          market_context?: Json | null
          mtf_trend?: Json | null
          outcome_correct?: boolean | null
          outcome_pnl?: number | null
          outcome_timestamp?: string | null
          position_sizing?: Json | null
          positioning?: Json | null
          price?: number | null
          quantity?: number | null
          regime_stability?: Json | null
          rules_triggered?: Json | null
          ticker: string
          tv_signal?: Json | null
        }
        Update: {
          action?: string
          action_reason?: string | null
          confidence?: number | null
          conflict_resolution?: Json | null
          confluence_score?: Json | null
          context_snapshot?: Json
          created_at?: string | null
          decision_timestamp?: string | null
          decision_type?: string
          gex_signals?: Json | null
          id?: string
          market_context?: Json | null
          mtf_trend?: Json | null
          outcome_correct?: boolean | null
          outcome_pnl?: number | null
          outcome_timestamp?: string | null
          position_sizing?: Json | null
          positioning?: Json | null
          price?: number | null
          quantity?: number | null
          regime_stability?: Json | null
          rules_triggered?: Json | null
          ticker?: string
          tv_signal?: Json | null
        }
        Relationships: []
      }
      exit_rules: {
        Row: {
          created_at: string
          delta_exit_threshold: number | null
          id: string
          is_active: boolean
          iv_crush_threshold: number | null
          max_days_in_trade: number | null
          min_days_to_expiration: number | null
          mode: string
          profit_target_percent: number | null
          stop_loss_percent: number | null
          theta_decay_threshold: number | null
          trailing_stop_percent: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_exit_threshold?: number | null
          id?: string
          is_active?: boolean
          iv_crush_threshold?: number | null
          max_days_in_trade?: number | null
          min_days_to_expiration?: number | null
          mode: string
          profit_target_percent?: number | null
          stop_loss_percent?: number | null
          theta_decay_threshold?: number | null
          trailing_stop_percent?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_exit_threshold?: number | null
          id?: string
          is_active?: boolean
          iv_crush_threshold?: number | null
          max_days_in_trade?: number | null
          min_days_to_expiration?: number | null
          mode?: string
          profit_target_percent?: number | null
          stop_loss_percent?: number | null
          theta_decay_threshold?: number | null
          trailing_stop_percent?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      gex_signals: {
        Row: {
          action_conviction: string | null
          action_reasoning: string | null
          bias_strength: string | null
          calculated_at: string | null
          call_walls: Json | null
          created_at: string | null
          current_price: number
          dealer_position: string | null
          expiration: string
          gex_flip_detected: boolean | null
          gex_flip_direction: string | null
          id: string
          key_resistance: number | null
          key_support: number | null
          market_regime: string | null
          max_pain_distance_pct: number | null
          max_pain_expected_direction: string | null
          max_pain_magnet_strength: string | null
          max_pain_strike: number | null
          nearest_call_wall: number | null
          nearest_call_wall_strength: string | null
          nearest_put_wall: number | null
          nearest_put_wall_strength: string | null
          net_gex: number | null
          overall_bias: string | null
          pc_combined_ratio: number | null
          pc_contrarian_conviction: string | null
          pc_contrarian_signal: string | null
          pc_oi_ratio: number | null
          pc_sentiment: string | null
          pc_volume_ratio: number | null
          previous_dealer_position: string | null
          put_walls: Json | null
          recommended_action: string | null
          regime_confidence: number | null
          regime_primary_driver: string | null
          regime_strategy: string | null
          ticker: string
          zero_gamma_level: number | null
        }
        Insert: {
          action_conviction?: string | null
          action_reasoning?: string | null
          bias_strength?: string | null
          calculated_at?: string | null
          call_walls?: Json | null
          created_at?: string | null
          current_price: number
          dealer_position?: string | null
          expiration: string
          gex_flip_detected?: boolean | null
          gex_flip_direction?: string | null
          id?: string
          key_resistance?: number | null
          key_support?: number | null
          market_regime?: string | null
          max_pain_distance_pct?: number | null
          max_pain_expected_direction?: string | null
          max_pain_magnet_strength?: string | null
          max_pain_strike?: number | null
          nearest_call_wall?: number | null
          nearest_call_wall_strength?: string | null
          nearest_put_wall?: number | null
          nearest_put_wall_strength?: string | null
          net_gex?: number | null
          overall_bias?: string | null
          pc_combined_ratio?: number | null
          pc_contrarian_conviction?: string | null
          pc_contrarian_signal?: string | null
          pc_oi_ratio?: number | null
          pc_sentiment?: string | null
          pc_volume_ratio?: number | null
          previous_dealer_position?: string | null
          put_walls?: Json | null
          recommended_action?: string | null
          regime_confidence?: number | null
          regime_primary_driver?: string | null
          regime_strategy?: string | null
          ticker: string
          zero_gamma_level?: number | null
        }
        Update: {
          action_conviction?: string | null
          action_reasoning?: string | null
          bias_strength?: string | null
          calculated_at?: string | null
          call_walls?: Json | null
          created_at?: string | null
          current_price?: number
          dealer_position?: string | null
          expiration?: string
          gex_flip_detected?: boolean | null
          gex_flip_direction?: string | null
          id?: string
          key_resistance?: number | null
          key_support?: number | null
          market_regime?: string | null
          max_pain_distance_pct?: number | null
          max_pain_expected_direction?: string | null
          max_pain_magnet_strength?: string | null
          max_pain_strike?: number | null
          nearest_call_wall?: number | null
          nearest_call_wall_strength?: string | null
          nearest_put_wall?: number | null
          nearest_put_wall_strength?: string | null
          net_gex?: number | null
          overall_bias?: string | null
          pc_combined_ratio?: number | null
          pc_contrarian_conviction?: string | null
          pc_contrarian_signal?: string | null
          pc_oi_ratio?: number | null
          pc_sentiment?: string | null
          pc_volume_ratio?: number | null
          previous_dealer_position?: string | null
          put_walls?: Json | null
          recommended_action?: string | null
          regime_confidence?: number | null
          regime_primary_driver?: string | null
          regime_strategy?: string | null
          ticker?: string
          zero_gamma_level?: number | null
        }
        Relationships: []
      }
      market_context: {
        Row: {
          atr: number | null
          atr_percentile: number | null
          bar_time: string | null
          bb_position: number | null
          candle_body_ratio: number | null
          candle_close_position: number | null
          candle_pattern: string | null
          candle_pattern_bias: string | null
          candle_strength: number | null
          candle_wick_ratio: number | null
          created_at: string | null
          dist_to_nearest_res_pct: number | null
          dist_to_nearest_sup_pct: number | null
          dist_to_r1_pct: number | null
          dist_to_s1_pct: number | null
          event_type: string | null
          exchange: string | null
          id: string
          is_first_30min: boolean | null
          is_inside_bar: boolean | null
          is_market_open: boolean | null
          is_outside_bar: boolean | null
          market_bias: string | null
          market_bias_changed: boolean | null
          moving_with_market: boolean | null
          nearest_resistance: number | null
          nearest_support: number | null
          ny_hour: number | null
          ny_minute: number | null
          or_breakout: string | null
          or_breakout_changed: boolean | null
          or_complete: boolean | null
          or_high: number | null
          or_low: number | null
          or_midpoint: number | null
          or_range: number | null
          pattern_detected: boolean | null
          pivot: number | null
          price: number
          prior_day_close: number | null
          prior_day_high: number | null
          prior_day_low: number | null
          qqq_price: number | null
          qqq_trend: string | null
          r1: number | null
          r2: number | null
          r3: number | null
          received_at: string | null
          regime_changed: boolean | null
          s1: number | null
          s2: number | null
          s3: number | null
          self_day_change_pct: number | null
          signal_timestamp: number | null
          significant_change: boolean | null
          spy_day_change_pct: number | null
          spy_price: number | null
          spy_rsi: number | null
          spy_trend: string | null
          ticker: string
          timeframe: string | null
          updated_at: string | null
          vix: number | null
          vix_changed: boolean | null
          vix_regime: string | null
          vix_sma20: number | null
          vix_trend: string | null
          vol_expansion_pct: number | null
        }
        Insert: {
          atr?: number | null
          atr_percentile?: number | null
          bar_time?: string | null
          bb_position?: number | null
          candle_body_ratio?: number | null
          candle_close_position?: number | null
          candle_pattern?: string | null
          candle_pattern_bias?: string | null
          candle_strength?: number | null
          candle_wick_ratio?: number | null
          created_at?: string | null
          dist_to_nearest_res_pct?: number | null
          dist_to_nearest_sup_pct?: number | null
          dist_to_r1_pct?: number | null
          dist_to_s1_pct?: number | null
          event_type?: string | null
          exchange?: string | null
          id?: string
          is_first_30min?: boolean | null
          is_inside_bar?: boolean | null
          is_market_open?: boolean | null
          is_outside_bar?: boolean | null
          market_bias?: string | null
          market_bias_changed?: boolean | null
          moving_with_market?: boolean | null
          nearest_resistance?: number | null
          nearest_support?: number | null
          ny_hour?: number | null
          ny_minute?: number | null
          or_breakout?: string | null
          or_breakout_changed?: boolean | null
          or_complete?: boolean | null
          or_high?: number | null
          or_low?: number | null
          or_midpoint?: number | null
          or_range?: number | null
          pattern_detected?: boolean | null
          pivot?: number | null
          price: number
          prior_day_close?: number | null
          prior_day_high?: number | null
          prior_day_low?: number | null
          qqq_price?: number | null
          qqq_trend?: string | null
          r1?: number | null
          r2?: number | null
          r3?: number | null
          received_at?: string | null
          regime_changed?: boolean | null
          s1?: number | null
          s2?: number | null
          s3?: number | null
          self_day_change_pct?: number | null
          signal_timestamp?: number | null
          significant_change?: boolean | null
          spy_day_change_pct?: number | null
          spy_price?: number | null
          spy_rsi?: number | null
          spy_trend?: string | null
          ticker: string
          timeframe?: string | null
          updated_at?: string | null
          vix?: number | null
          vix_changed?: boolean | null
          vix_regime?: string | null
          vix_sma20?: number | null
          vix_trend?: string | null
          vol_expansion_pct?: number | null
        }
        Update: {
          atr?: number | null
          atr_percentile?: number | null
          bar_time?: string | null
          bb_position?: number | null
          candle_body_ratio?: number | null
          candle_close_position?: number | null
          candle_pattern?: string | null
          candle_pattern_bias?: string | null
          candle_strength?: number | null
          candle_wick_ratio?: number | null
          created_at?: string | null
          dist_to_nearest_res_pct?: number | null
          dist_to_nearest_sup_pct?: number | null
          dist_to_r1_pct?: number | null
          dist_to_s1_pct?: number | null
          event_type?: string | null
          exchange?: string | null
          id?: string
          is_first_30min?: boolean | null
          is_inside_bar?: boolean | null
          is_market_open?: boolean | null
          is_outside_bar?: boolean | null
          market_bias?: string | null
          market_bias_changed?: boolean | null
          moving_with_market?: boolean | null
          nearest_resistance?: number | null
          nearest_support?: number | null
          ny_hour?: number | null
          ny_minute?: number | null
          or_breakout?: string | null
          or_breakout_changed?: boolean | null
          or_complete?: boolean | null
          or_high?: number | null
          or_low?: number | null
          or_midpoint?: number | null
          or_range?: number | null
          pattern_detected?: boolean | null
          pivot?: number | null
          price?: number
          prior_day_close?: number | null
          prior_day_high?: number | null
          prior_day_low?: number | null
          qqq_price?: number | null
          qqq_trend?: string | null
          r1?: number | null
          r2?: number | null
          r3?: number | null
          received_at?: string | null
          regime_changed?: boolean | null
          s1?: number | null
          s2?: number | null
          s3?: number | null
          self_day_change_pct?: number | null
          signal_timestamp?: number | null
          significant_change?: boolean | null
          spy_day_change_pct?: number | null
          spy_price?: number | null
          spy_rsi?: number | null
          spy_trend?: string | null
          ticker?: string
          timeframe?: string | null
          updated_at?: string | null
          vix?: number | null
          vix_changed?: boolean | null
          vix_regime?: string | null
          vix_sma20?: number | null
          vix_trend?: string | null
          vol_expansion_pct?: number | null
        }
        Relationships: []
      }
      market_data: {
        Row: {
          ask: number | null
          bid: number | null
          created_at: string | null
          delta: number | null
          exchange: string | null
          gamma: number | null
          id: string
          implied_volatility: number | null
          last: number | null
          mark: number | null
          open_interest: number | null
          quote_time: string
          rho: number | null
          symbol: string
          theta: number | null
          underlying: string
          vega: number | null
          volume: number | null
        }
        Insert: {
          ask?: number | null
          bid?: number | null
          created_at?: string | null
          delta?: number | null
          exchange?: string | null
          gamma?: number | null
          id?: string
          implied_volatility?: number | null
          last?: number | null
          mark?: number | null
          open_interest?: number | null
          quote_time: string
          rho?: number | null
          symbol: string
          theta?: number | null
          underlying: string
          vega?: number | null
          volume?: number | null
        }
        Update: {
          ask?: number | null
          bid?: number | null
          created_at?: string | null
          delta?: number | null
          exchange?: string | null
          gamma?: number | null
          id?: string
          implied_volatility?: number | null
          last?: number | null
          mark?: number | null
          open_interest?: number | null
          quote_time?: string
          rho?: number | null
          symbol?: string
          theta?: number | null
          underlying?: string
          vega?: number | null
          volume?: number | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          avg_fill_price: number | null
          broker_order_id: string | null
          broker_response: Json | null
          cancelled_at: string | null
          client_order_id: string | null
          created_at: string | null
          error_message: string | null
          expiration: string
          filled_at: string | null
          filled_quantity: number | null
          id: string
          leg_number: number | null
          limit_price: number | null
          mode: string
          option_type: string
          order_type: string | null
          quantity: number
          rejection_reason: string | null
          side: string
          signal_id: string | null
          status: string | null
          stop_price: number | null
          strategy_id: string | null
          strike: number
          submitted_at: string | null
          symbol: string
          time_in_force: string | null
          underlying: string
          updated_at: string | null
        }
        Insert: {
          avg_fill_price?: number | null
          broker_order_id?: string | null
          broker_response?: Json | null
          cancelled_at?: string | null
          client_order_id?: string | null
          created_at?: string | null
          error_message?: string | null
          expiration: string
          filled_at?: string | null
          filled_quantity?: number | null
          id?: string
          leg_number?: number | null
          limit_price?: number | null
          mode: string
          option_type: string
          order_type?: string | null
          quantity: number
          rejection_reason?: string | null
          side: string
          signal_id?: string | null
          status?: string | null
          stop_price?: number | null
          strategy_id?: string | null
          strike: number
          submitted_at?: string | null
          symbol: string
          time_in_force?: string | null
          underlying: string
          updated_at?: string | null
        }
        Update: {
          avg_fill_price?: number | null
          broker_order_id?: string | null
          broker_response?: Json | null
          cancelled_at?: string | null
          client_order_id?: string | null
          created_at?: string | null
          error_message?: string | null
          expiration?: string
          filled_at?: string | null
          filled_quantity?: number | null
          id?: string
          leg_number?: number | null
          limit_price?: number | null
          mode?: string
          option_type?: string
          order_type?: string | null
          quantity?: number
          rejection_reason?: string | null
          side?: string
          signal_id?: string | null
          status?: string | null
          stop_price?: number | null
          strategy_id?: string | null
          strike?: number
          submitted_at?: string | null
          symbol?: string
          time_in_force?: string | null
          underlying?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trades: {
        Row: {
          created_at: string | null
          current_delta: number | null
          current_gamma: number | null
          current_iv: number | null
          current_price: number | null
          current_theta: number | null
          current_underlying_price: number | null
          entry_context: Json | null
          entry_dealer_position: string | null
          entry_decision_log: Json | null
          entry_delta: number | null
          entry_gamma: number | null
          entry_iv: number | null
          entry_market_regime: string | null
          entry_max_pain: number | null
          entry_pc_ratio: number | null
          entry_price: number
          entry_theta: number | null
          entry_timestamp: string | null
          entry_underlying_price: number | null
          entry_vix: number | null
          entry_zero_gamma: number | null
          exit_decision_log: Json | null
          exit_market_regime: string | null
          exit_price: number | null
          exit_reason: string | null
          exit_signal_type: string | null
          exit_timestamp: string | null
          exit_underlying_price: number | null
          expiration: string
          highest_price_since_entry: number | null
          hold_decisions_log: Json | null
          id: string
          lowest_price_since_entry: number | null
          max_adverse_excursion: number | null
          max_favorable_excursion: number | null
          max_hold_hours: number | null
          option_type: string
          partial_exit_price: number | null
          partial_exit_quantity: number | null
          partial_exit_reason: string | null
          partial_exit_timestamp: string | null
          planned_stop_loss: number | null
          planned_target_1: number | null
          planned_target_2: number | null
          quantity: number
          realized_pnl: number | null
          side: string
          signal_id: string | null
          status: string | null
          strike: number
          symbol: string
          ticker: string
          time_in_trade_hours: number | null
          total_pnl: number | null
          trailing_stop_enabled: boolean | null
          trailing_stop_pct: number | null
          unrealized_pnl: number | null
          unrealized_pnl_pct: number | null
          updated_at: string | null
          warnings_log: Json | null
        }
        Insert: {
          created_at?: string | null
          current_delta?: number | null
          current_gamma?: number | null
          current_iv?: number | null
          current_price?: number | null
          current_theta?: number | null
          current_underlying_price?: number | null
          entry_context?: Json | null
          entry_dealer_position?: string | null
          entry_decision_log?: Json | null
          entry_delta?: number | null
          entry_gamma?: number | null
          entry_iv?: number | null
          entry_market_regime?: string | null
          entry_max_pain?: number | null
          entry_pc_ratio?: number | null
          entry_price: number
          entry_theta?: number | null
          entry_timestamp?: string | null
          entry_underlying_price?: number | null
          entry_vix?: number | null
          entry_zero_gamma?: number | null
          exit_decision_log?: Json | null
          exit_market_regime?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_signal_type?: string | null
          exit_timestamp?: string | null
          exit_underlying_price?: number | null
          expiration: string
          highest_price_since_entry?: number | null
          hold_decisions_log?: Json | null
          id?: string
          lowest_price_since_entry?: number | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          max_hold_hours?: number | null
          option_type: string
          partial_exit_price?: number | null
          partial_exit_quantity?: number | null
          partial_exit_reason?: string | null
          partial_exit_timestamp?: string | null
          planned_stop_loss?: number | null
          planned_target_1?: number | null
          planned_target_2?: number | null
          quantity: number
          realized_pnl?: number | null
          side: string
          signal_id?: string | null
          status?: string | null
          strike: number
          symbol: string
          ticker: string
          time_in_trade_hours?: number | null
          total_pnl?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_pct?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_pct?: number | null
          updated_at?: string | null
          warnings_log?: Json | null
        }
        Update: {
          created_at?: string | null
          current_delta?: number | null
          current_gamma?: number | null
          current_iv?: number | null
          current_price?: number | null
          current_theta?: number | null
          current_underlying_price?: number | null
          entry_context?: Json | null
          entry_dealer_position?: string | null
          entry_decision_log?: Json | null
          entry_delta?: number | null
          entry_gamma?: number | null
          entry_iv?: number | null
          entry_market_regime?: string | null
          entry_max_pain?: number | null
          entry_pc_ratio?: number | null
          entry_price?: number
          entry_theta?: number | null
          entry_timestamp?: string | null
          entry_underlying_price?: number | null
          entry_vix?: number | null
          entry_zero_gamma?: number | null
          exit_decision_log?: Json | null
          exit_market_regime?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_signal_type?: string | null
          exit_timestamp?: string | null
          exit_underlying_price?: number | null
          expiration?: string
          highest_price_since_entry?: number | null
          hold_decisions_log?: Json | null
          id?: string
          lowest_price_since_entry?: number | null
          max_adverse_excursion?: number | null
          max_favorable_excursion?: number | null
          max_hold_hours?: number | null
          option_type?: string
          partial_exit_price?: number | null
          partial_exit_quantity?: number | null
          partial_exit_reason?: string | null
          partial_exit_timestamp?: string | null
          planned_stop_loss?: number | null
          planned_target_1?: number | null
          planned_target_2?: number | null
          quantity?: number
          realized_pnl?: number | null
          side?: string
          signal_id?: string | null
          status?: string | null
          strike?: number
          symbol?: string
          ticker?: string
          time_in_trade_hours?: number | null
          total_pnl?: number | null
          trailing_stop_enabled?: boolean | null
          trailing_stop_pct?: number | null
          unrealized_pnl?: number | null
          unrealized_pnl_pct?: number | null
          updated_at?: string | null
          warnings_log?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_trades_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_trading_account: {
        Row: {
          account_name: string | null
          average_loser: number | null
          average_winner: number | null
          best_trade_pnl: number | null
          breakout_trades: number | null
          breakout_win_rate: number | null
          created_at: string | null
          current_balance: number | null
          daily_pnl: number | null
          daily_reset_at: string | null
          daily_trades: number | null
          gex_flip_trades: number | null
          gex_flip_win_rate: number | null
          id: string
          is_active: boolean | null
          losing_trades: number | null
          max_daily_loss: number | null
          max_drawdown: number | null
          max_drawdown_pct: number | null
          max_pain_trades: number | null
          max_pain_win_rate: number | null
          max_position_size: number | null
          max_positions: number | null
          max_weekly_loss: number | null
          mode: string | null
          pc_extreme_trades: number | null
          pc_extreme_win_rate: number | null
          profit_factor: number | null
          range_bound_trades: number | null
          range_bound_win_rate: number | null
          reversal_trades: number | null
          reversal_win_rate: number | null
          risk_per_trade_pct: number | null
          starting_balance: number | null
          total_pnl: number | null
          total_trades: number | null
          trending_down_trades: number | null
          trending_down_win_rate: number | null
          trending_up_trades: number | null
          trending_up_win_rate: number | null
          updated_at: string | null
          weekly_pnl: number | null
          weekly_reset_at: string | null
          weekly_trades: number | null
          win_rate: number | null
          winning_trades: number | null
          worst_trade_pnl: number | null
          zero_gamma_trades: number | null
          zero_gamma_win_rate: number | null
        }
        Insert: {
          account_name?: string | null
          average_loser?: number | null
          average_winner?: number | null
          best_trade_pnl?: number | null
          breakout_trades?: number | null
          breakout_win_rate?: number | null
          created_at?: string | null
          current_balance?: number | null
          daily_pnl?: number | null
          daily_reset_at?: string | null
          daily_trades?: number | null
          gex_flip_trades?: number | null
          gex_flip_win_rate?: number | null
          id?: string
          is_active?: boolean | null
          losing_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_drawdown_pct?: number | null
          max_pain_trades?: number | null
          max_pain_win_rate?: number | null
          max_position_size?: number | null
          max_positions?: number | null
          max_weekly_loss?: number | null
          mode?: string | null
          pc_extreme_trades?: number | null
          pc_extreme_win_rate?: number | null
          profit_factor?: number | null
          range_bound_trades?: number | null
          range_bound_win_rate?: number | null
          reversal_trades?: number | null
          reversal_win_rate?: number | null
          risk_per_trade_pct?: number | null
          starting_balance?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          trending_down_trades?: number | null
          trending_down_win_rate?: number | null
          trending_up_trades?: number | null
          trending_up_win_rate?: number | null
          updated_at?: string | null
          weekly_pnl?: number | null
          weekly_reset_at?: string | null
          weekly_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
          worst_trade_pnl?: number | null
          zero_gamma_trades?: number | null
          zero_gamma_win_rate?: number | null
        }
        Update: {
          account_name?: string | null
          average_loser?: number | null
          average_winner?: number | null
          best_trade_pnl?: number | null
          breakout_trades?: number | null
          breakout_win_rate?: number | null
          created_at?: string | null
          current_balance?: number | null
          daily_pnl?: number | null
          daily_reset_at?: string | null
          daily_trades?: number | null
          gex_flip_trades?: number | null
          gex_flip_win_rate?: number | null
          id?: string
          is_active?: boolean | null
          losing_trades?: number | null
          max_daily_loss?: number | null
          max_drawdown?: number | null
          max_drawdown_pct?: number | null
          max_pain_trades?: number | null
          max_pain_win_rate?: number | null
          max_position_size?: number | null
          max_positions?: number | null
          max_weekly_loss?: number | null
          mode?: string | null
          pc_extreme_trades?: number | null
          pc_extreme_win_rate?: number | null
          profit_factor?: number | null
          range_bound_trades?: number | null
          range_bound_win_rate?: number | null
          reversal_trades?: number | null
          reversal_win_rate?: number | null
          risk_per_trade_pct?: number | null
          starting_balance?: number | null
          total_pnl?: number | null
          total_trades?: number | null
          trending_down_trades?: number | null
          trending_down_win_rate?: number | null
          trending_up_trades?: number | null
          trending_up_win_rate?: number | null
          updated_at?: string | null
          weekly_pnl?: number | null
          weekly_reset_at?: string | null
          weekly_trades?: number | null
          win_rate?: number | null
          winning_trades?: number | null
          worst_trade_pnl?: number | null
          zero_gamma_trades?: number | null
          zero_gamma_win_rate?: number | null
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          buying_power: number
          cash_balance: number
          created_at: string | null
          day_pnl: number | null
          day_pnl_percent: number | null
          id: string
          margin_used: number | null
          mode: string
          open_positions_count: number | null
          snapshot_at: string
          total_delta: number | null
          total_gamma: number | null
          total_pnl: number | null
          total_pnl_percent: number | null
          total_positions_value: number | null
          total_theta: number | null
          total_value: number
          total_vega: number | null
        }
        Insert: {
          buying_power: number
          cash_balance: number
          created_at?: string | null
          day_pnl?: number | null
          day_pnl_percent?: number | null
          id?: string
          margin_used?: number | null
          mode: string
          open_positions_count?: number | null
          snapshot_at: string
          total_delta?: number | null
          total_gamma?: number | null
          total_pnl?: number | null
          total_pnl_percent?: number | null
          total_positions_value?: number | null
          total_theta?: number | null
          total_value: number
          total_vega?: number | null
        }
        Update: {
          buying_power?: number
          cash_balance?: number
          created_at?: string | null
          day_pnl?: number | null
          day_pnl_percent?: number | null
          id?: string
          margin_used?: number | null
          mode?: string
          open_positions_count?: number | null
          snapshot_at?: string
          total_delta?: number | null
          total_gamma?: number | null
          total_pnl?: number | null
          total_pnl_percent?: number | null
          total_positions_value?: number | null
          total_theta?: number | null
          total_value?: number
          total_vega?: number | null
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_open_price: number
          closed_at: string | null
          created_at: string | null
          current_price: number | null
          delta: number | null
          entry_iv: number | null
          expiration: string
          gamma: number | null
          high_water_mark: number | null
          id: string
          implied_volatility: number | null
          is_closed: boolean | null
          last_updated: string | null
          market_value: number | null
          opened_at: string
          option_type: string
          quantity: number
          realized_pnl: number | null
          strike: number
          symbol: string
          theta: number | null
          total_cost: number
          underlying: string
          unrealized_pnl: number | null
          unrealized_pnl_percent: number | null
          vega: number | null
        }
        Insert: {
          avg_open_price: number
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          delta?: number | null
          entry_iv?: number | null
          expiration: string
          gamma?: number | null
          high_water_mark?: number | null
          id?: string
          implied_volatility?: number | null
          is_closed?: boolean | null
          last_updated?: string | null
          market_value?: number | null
          opened_at: string
          option_type: string
          quantity: number
          realized_pnl?: number | null
          strike: number
          symbol: string
          theta?: number | null
          total_cost: number
          underlying: string
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          vega?: number | null
        }
        Update: {
          avg_open_price?: number
          closed_at?: string | null
          created_at?: string | null
          current_price?: number | null
          delta?: number | null
          entry_iv?: number | null
          expiration?: string
          gamma?: number | null
          high_water_mark?: number | null
          id?: string
          implied_volatility?: number | null
          is_closed?: boolean | null
          last_updated?: string | null
          market_value?: number | null
          opened_at?: string
          option_type?: string
          quantity?: number
          realized_pnl?: number | null
          strike?: number
          symbol?: string
          theta?: number | null
          total_cost?: number
          underlying?: string
          unrealized_pnl?: number | null
          unrealized_pnl_percent?: number | null
          vega?: number | null
        }
        Relationships: []
      }
      regime_history: {
        Row: {
          checked_at: string | null
          consecutive_same_regime: number | null
          dealer_position: string | null
          expiration: string | null
          id: string
          is_stable: boolean | null
          last_flip_timestamp: string | null
          net_gex: number | null
          regime: string
          regime_confidence: number
          seconds_since_flip: number | null
          stability_score: number | null
          ticker: string
          time_in_regime_seconds: number | null
          zero_gamma_level: number | null
        }
        Insert: {
          checked_at?: string | null
          consecutive_same_regime?: number | null
          dealer_position?: string | null
          expiration?: string | null
          id?: string
          is_stable?: boolean | null
          last_flip_timestamp?: string | null
          net_gex?: number | null
          regime: string
          regime_confidence: number
          seconds_since_flip?: number | null
          stability_score?: number | null
          ticker: string
          time_in_regime_seconds?: number | null
          zero_gamma_level?: number | null
        }
        Update: {
          checked_at?: string | null
          consecutive_same_regime?: number | null
          dealer_position?: string | null
          expiration?: string | null
          id?: string
          is_stable?: boolean | null
          last_flip_timestamp?: string | null
          net_gex?: number | null
          regime?: string
          regime_confidence?: number
          seconds_since_flip?: number | null
          stability_score?: number | null
          ticker?: string
          time_in_regime_seconds?: number | null
          zero_gamma_level?: number | null
        }
        Relationships: []
      }
      regime_performance: {
        Row: {
          average_loss: number | null
          average_win: number | null
          dealer_position: string | null
          half_kelly: number | null
          id: string
          kelly_fraction: number | null
          losing_trades: number | null
          period_end: string | null
          period_start: string | null
          regime: string
          total_pnl: number | null
          total_trades: number | null
          updated_at: string | null
          win_loss_ratio: number | null
          win_rate: number | null
          winning_trades: number | null
        }
        Insert: {
          average_loss?: number | null
          average_win?: number | null
          dealer_position?: string | null
          half_kelly?: number | null
          id?: string
          kelly_fraction?: number | null
          losing_trades?: number | null
          period_end?: string | null
          period_start?: string | null
          regime: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string | null
          win_loss_ratio?: number | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Update: {
          average_loss?: number | null
          average_win?: number | null
          dealer_position?: string | null
          half_kelly?: number | null
          id?: string
          kelly_fraction?: number | null
          losing_trades?: number | null
          period_end?: string | null
          period_start?: string | null
          regime?: string
          total_pnl?: number | null
          total_trades?: number | null
          updated_at?: string | null
          win_loss_ratio?: number | null
          win_rate?: number | null
          winning_trades?: number | null
        }
        Relationships: []
      }
      risk_limits: {
        Row: {
          auto_close_enabled: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          max_daily_loss: number | null
          max_expiration_concentration: number | null
          max_portfolio_delta: number | null
          max_portfolio_gamma: number | null
          max_portfolio_vega: number | null
          max_position_size: number | null
          max_position_value: number | null
          max_total_portfolio_loss: number | null
          max_total_positions: number | null
          max_underlying_exposure: number | null
          max_weekly_loss: number | null
          mode: string
          mtf_allow_weak_signals: boolean | null
          mtf_apply_position_sizing: boolean | null
          mtf_min_alignment_score: number | null
          mtf_min_confluence: number | null
          mtf_mode: string | null
          updated_at: string | null
        }
        Insert: {
          auto_close_enabled?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_loss?: number | null
          max_expiration_concentration?: number | null
          max_portfolio_delta?: number | null
          max_portfolio_gamma?: number | null
          max_portfolio_vega?: number | null
          max_position_size?: number | null
          max_position_value?: number | null
          max_total_portfolio_loss?: number | null
          max_total_positions?: number | null
          max_underlying_exposure?: number | null
          max_weekly_loss?: number | null
          mode: string
          mtf_allow_weak_signals?: boolean | null
          mtf_apply_position_sizing?: boolean | null
          mtf_min_alignment_score?: number | null
          mtf_min_confluence?: number | null
          mtf_mode?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_close_enabled?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_daily_loss?: number | null
          max_expiration_concentration?: number | null
          max_portfolio_delta?: number | null
          max_portfolio_gamma?: number | null
          max_portfolio_vega?: number | null
          max_position_size?: number | null
          max_position_value?: number | null
          max_total_portfolio_loss?: number | null
          max_total_positions?: number | null
          max_underlying_exposure?: number | null
          max_weekly_loss?: number | null
          mode?: string
          mtf_allow_weak_signals?: boolean | null
          mtf_apply_position_sizing?: boolean | null
          mtf_min_alignment_score?: number | null
          mtf_min_confluence?: number | null
          mtf_mode?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      risk_violations: {
        Row: {
          action_taken: string | null
          created_at: string | null
          current_value: number | null
          id: string
          limit_value: number | null
          order_id: string | null
          rule_violated: string
          severity: string | null
          signal_id: string | null
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          limit_value?: number | null
          order_id?: string | null
          rule_violated: string
          severity?: string | null
          signal_id?: string | null
          violation_type: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          limit_value?: number | null
          order_id?: string | null
          rule_violated?: string
          severity?: string | null
          signal_id?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_violations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_violations_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_performance: {
        Row: {
          accuracy_rate: number | null
          avg_confidence_impact: number | null
          avg_pnl_when_triggered: number | null
          current_threshold: number | null
          id: string
          rule_category: string | null
          rule_id: string
          suggested_threshold: number | null
          times_correct: number | null
          times_triggered: number | null
          tune_confidence: number | null
          tune_direction: string | null
          updated_at: string | null
        }
        Insert: {
          accuracy_rate?: number | null
          avg_confidence_impact?: number | null
          avg_pnl_when_triggered?: number | null
          current_threshold?: number | null
          id?: string
          rule_category?: string | null
          rule_id: string
          suggested_threshold?: number | null
          times_correct?: number | null
          times_triggered?: number | null
          tune_confidence?: number | null
          tune_direction?: string | null
          updated_at?: string | null
        }
        Update: {
          accuracy_rate?: number | null
          avg_confidence_impact?: number | null
          avg_pnl_when_triggered?: number | null
          current_threshold?: number | null
          id?: string
          rule_category?: string | null
          rule_id?: string
          suggested_threshold?: number | null
          times_correct?: number | null
          times_triggered?: number | null
          tune_confidence?: number | null
          tune_direction?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      signal_scores: {
        Row: {
          age_seconds: number | null
          created_at: string | null
          decay_factor: number | null
          decayed_score: number | null
          direction: string | null
          direction_strength: number | null
          id: string
          normalized_score: number
          raw_scale_max: number | null
          raw_scale_min: number | null
          raw_score: number
          signal_source: string
          signal_timestamp: string
          signal_type: string
          source_data: Json | null
          ticker: string
        }
        Insert: {
          age_seconds?: number | null
          created_at?: string | null
          decay_factor?: number | null
          decayed_score?: number | null
          direction?: string | null
          direction_strength?: number | null
          id?: string
          normalized_score: number
          raw_scale_max?: number | null
          raw_scale_min?: number | null
          raw_score: number
          signal_source: string
          signal_timestamp: string
          signal_type: string
          source_data?: Json | null
          ticker: string
        }
        Update: {
          age_seconds?: number | null
          created_at?: string | null
          decay_factor?: number | null
          decayed_score?: number | null
          direction?: string | null
          direction_strength?: number | null
          id?: string
          normalized_score?: number
          raw_scale_max?: number | null
          raw_scale_min?: number | null
          raw_score?: number
          signal_source?: string
          signal_timestamp?: string
          signal_type?: string
          source_data?: Json | null
          ticker?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          action: string | null
          created_at: string | null
          expiration: string | null
          id: string
          option_type: string | null
          processed_at: string | null
          quantity: number | null
          raw_payload: Json
          signal_hash: string
          signature_verified: boolean | null
          source: string
          status: string | null
          strategy_type: string | null
          strike: number | null
          underlying: string | null
          updated_at: string | null
          validation_errors: Json | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          expiration?: string | null
          id?: string
          option_type?: string | null
          processed_at?: string | null
          quantity?: number | null
          raw_payload: Json
          signal_hash: string
          signature_verified?: boolean | null
          source: string
          status?: string | null
          strategy_type?: string | null
          strike?: number | null
          underlying?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          expiration?: string | null
          id?: string
          option_type?: string | null
          processed_at?: string | null
          quantity?: number | null
          raw_payload?: Json
          signal_hash?: string
          signature_verified?: boolean | null
          source?: string
          status?: string | null
          strategy_type?: string | null
          strike?: number | null
          underlying?: string | null
          updated_at?: string | null
          validation_errors?: Json | null
        }
        Relationships: []
      }
      refactored_context_snapshots: {
        Row: {
          bias: number
          created_at: string | null
          id: string
          regime: string
          timestamp: string
          trend: string
          vix: number
        }
        Insert: {
          bias: number
          created_at?: string | null
          id: string
          regime: string
          timestamp: string
          trend: string
          vix: number
        }
        Update: {
          bias?: number
          created_at?: string | null
          id?: string
          regime?: string
          timestamp?: string
          trend?: string
          vix?: number
        }
        Relationships: []
      }
      refactored_decisions: {
        Row: {
          calculations: Json
          confidence: number | null
          context_data: Json | null
          created_at: string | null
          decision: string
          decision_type: string
          gex_data: Json | null
          id: string
          position_size: number | null
          reasoning: Json
          signal_id: string
        }
        Insert: {
          calculations?: Json
          confidence?: number | null
          context_data?: Json | null
          created_at?: string | null
          decision: string
          decision_type: string
          gex_data?: Json | null
          id: string
          position_size?: number | null
          reasoning?: Json
          signal_id: string
        }
        Update: {
          calculations?: Json
          confidence?: number | null
          context_data?: Json | null
          created_at?: string | null
          decision?: string
          decision_type?: string
          gex_data?: Json | null
          id?: string
          position_size?: number | null
          reasoning?: Json
          signal_id?: string
        }
        Relationships: []
      }
      refactored_gex_signals: {
        Row: {
          age: number | null
          created_at: string | null
          direction: string
          id: string
          metadata: Json | null
          strength: number
          symbol: string
          timeframe: string
          timestamp: string
        }
        Insert: {
          age?: number | null
          created_at?: string | null
          direction: string
          id: string
          metadata?: Json | null
          strength: number
          symbol: string
          timeframe: string
          timestamp: string
        }
        Update: {
          age?: number | null
          created_at?: string | null
          direction?: string
          id?: string
          metadata?: Json | null
          strength?: number
          symbol?: string
          timeframe?: string
          timestamp?: string
        }
        Relationships: []
      }
      refactored_pipeline_failures: {
        Row: {
          created_at: string | null
          id: string
          reason: string
          signal_data: Json | null
          signal_id: string | null
          stage: string
          timestamp: string
          tracking_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reason: string
          signal_data?: Json | null
          signal_id?: string | null
          stage: string
          timestamp: string
          tracking_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reason?: string
          signal_data?: Json | null
          signal_id?: string | null
          stage?: string
          timestamp?: string
          tracking_id?: string
        }
        Relationships: []
      }
      refactored_positions: {
        Row: {
          created_at: string | null
          current_price: number | null
          direction: string
          entry_price: number
          entry_time: string
          exit_price: number | null
          exit_time: string | null
          id: string
          quantity: number
          realized_pnl: number | null
          signal_id: string
          status: string
          symbol: string
          unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_price?: number | null
          direction: string
          entry_price: number
          entry_time: string
          exit_price?: number | null
          exit_time?: string | null
          id: string
          quantity: number
          realized_pnl?: number | null
          signal_id: string
          status: string
          symbol: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_price?: number | null
          direction?: string
          entry_price?: number
          entry_time?: string
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          quantity?: number
          realized_pnl?: number | null
          signal_id?: string
          status?: string
          symbol?: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      refactored_signals: {
        Row: {
          created_at: string | null
          direction: string
          id: string
          metadata: Json | null
          source: string
          symbol: string
          timeframe: string
          timestamp: string
          validation_result: Json | null
        }
        Insert: {
          created_at?: string | null
          direction: string
          id: string
          metadata?: Json | null
          source: string
          symbol: string
          timeframe: string
          timestamp: string
          validation_result?: Json | null
        }
        Update: {
          created_at?: string | null
          direction?: string
          id?: string
          metadata?: Json | null
          source?: string
          symbol?: string
          timeframe?: string
          timestamp?: string
          validation_result?: Json | null
        }
        Relationships: []
      }
      refactored_processing_errors: {
        Row: {
          correlation_id: string
          created_at: string | null
          error_message: string
          error_stack: string | null
          id: string
          raw_payload: Json | null
        }
        Insert: {
          correlation_id: string
          created_at?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          raw_payload?: Json | null
        }
        Update: {
          correlation_id?: string
          created_at?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          raw_payload?: Json | null
        }
        Relationships: []
      }
      source_credibility: {
        Row: {
          accuracy_rate: number | null
          adjusted_weight: number | null
          base_weight: number
          correct_signals: number | null
          credibility_score: number | null
          id: string
          recent_accuracy: number | null
          recent_correct: number | null
          recent_total: number | null
          source: string
          total_signals: number | null
          updated_at: string | null
        }
        Insert: {
          accuracy_rate?: number | null
          adjusted_weight?: number | null
          base_weight: number
          correct_signals?: number | null
          credibility_score?: number | null
          id?: string
          recent_accuracy?: number | null
          recent_correct?: number | null
          recent_total?: number | null
          source: string
          total_signals?: number | null
          updated_at?: string | null
        }
        Update: {
          accuracy_rate?: number | null
          adjusted_weight?: number | null
          base_weight?: number
          correct_signals?: number | null
          credibility_score?: number | null
          id?: string
          recent_accuracy?: number | null
          recent_correct?: number | null
          recent_total?: number | null
          source?: string
          total_signals?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      strategies: {
        Row: {
          closed_at: string | null
          created_at: string | null
          current_value: number | null
          id: string
          max_loss: number | null
          max_profit: number | null
          opened_at: string | null
          signal_id: string | null
          status: string | null
          strategy_type: string
          total_cost: number | null
          total_credit: number | null
          underlying: string
          unrealized_pnl: number | null
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          max_loss?: number | null
          max_profit?: number | null
          opened_at?: string | null
          signal_id?: string | null
          status?: string | null
          strategy_type: string
          total_cost?: number | null
          total_credit?: number | null
          underlying: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          current_value?: number | null
          id?: string
          max_loss?: number | null
          max_profit?: number | null
          opened_at?: string | null
          signal_id?: string | null
          status?: string | null
          strategy_type?: string
          total_cost?: number | null
          total_credit?: number | null
          underlying?: string
          unrealized_pnl?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "strategies_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          broker_trade_id: string | null
          commission: number | null
          created_at: string | null
          executed_at: string
          execution_price: number
          expiration: string
          fees: number | null
          id: string
          option_type: string
          order_id: string
          quantity: number
          strike: number
          symbol: string
          total_cost: number
          underlying: string
        }
        Insert: {
          broker_trade_id?: string | null
          commission?: number | null
          created_at?: string | null
          executed_at: string
          execution_price: number
          expiration: string
          fees?: number | null
          id?: string
          option_type: string
          order_id: string
          quantity: number
          strike: number
          symbol: string
          total_cost: number
          underlying: string
        }
        Update: {
          broker_trade_id?: string | null
          commission?: number | null
          created_at?: string | null
          executed_at?: string
          execution_price?: number
          expiration?: string
          fees?: number | null
          id?: string
          option_type?: string
          order_id?: string
          quantity?: number
          strike?: number
          symbol?: string
          total_cost?: number
          underlying?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vix_sizing_rules: {
        Row: {
          id: string
          max_positions: number | null
          notes: string | null
          size_multiplier: number
          vix_max: number
          vix_min: number
        }
        Insert: {
          id?: string
          max_positions?: number | null
          notes?: string | null
          size_multiplier: number
          vix_max: number
          vix_min: number
        }
        Update: {
          id?: string
          max_positions?: number | null
          notes?: string | null
          size_multiplier?: number
          vix_max?: number
          vix_min?: number
        }
        Relationships: []
      }
    }
    Views: {
      latest_market_context: {
        Row: {
          atr: number | null
          atr_percentile: number | null
          bar_time: string | null
          bb_position: number | null
          candle_body_ratio: number | null
          candle_close_position: number | null
          candle_pattern: string | null
          candle_pattern_bias: string | null
          candle_strength: number | null
          candle_wick_ratio: number | null
          created_at: string | null
          dist_to_nearest_res_pct: number | null
          dist_to_nearest_sup_pct: number | null
          dist_to_r1_pct: number | null
          dist_to_s1_pct: number | null
          event_type: string | null
          exchange: string | null
          id: string | null
          is_first_30min: boolean | null
          is_inside_bar: boolean | null
          is_market_open: boolean | null
          is_outside_bar: boolean | null
          market_bias: string | null
          market_bias_changed: boolean | null
          moving_with_market: boolean | null
          nearest_resistance: number | null
          nearest_support: number | null
          ny_hour: number | null
          ny_minute: number | null
          or_breakout: string | null
          or_breakout_changed: boolean | null
          or_complete: boolean | null
          or_high: number | null
          or_low: number | null
          or_midpoint: number | null
          or_range: number | null
          pattern_detected: boolean | null
          pivot: number | null
          price: number | null
          prior_day_close: number | null
          prior_day_high: number | null
          prior_day_low: number | null
          qqq_price: number | null
          qqq_trend: string | null
          r1: number | null
          r2: number | null
          r3: number | null
          received_at: string | null
          regime_changed: boolean | null
          s1: number | null
          s2: number | null
          s3: number | null
          self_day_change_pct: number | null
          signal_timestamp: number | null
          significant_change: boolean | null
          spy_day_change_pct: number | null
          spy_price: number | null
          spy_rsi: number | null
          spy_trend: string | null
          ticker: string | null
          timeframe: string | null
          updated_at: string | null
          vix: number | null
          vix_changed: boolean | null
          vix_regime: string | null
          vix_sma20: number | null
          vix_trend: string | null
          vol_expansion_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
