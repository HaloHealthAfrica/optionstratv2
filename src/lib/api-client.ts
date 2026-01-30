/**
 * API Client for Fly.io Backend
 * Replaces Supabase client with direct API calls
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://optionstrat-backend.fly.dev';

interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // Health check
  async health() {
    return this.request<{ status: string; timestamp: string }>('/health');
  }

  // Stats endpoint
  async getStats() {
    return this.request<any>('/stats');
  }

  // Positions endpoints
  async getPositions(params?: { showClosed?: boolean; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.showClosed) query.set('show_closed', 'true');
    if (params?.limit) query.set('limit', params.limit.toString());
    const queryString = query.toString();
    return this.request<any[]>(`/positions${queryString ? `?${queryString}` : ''}`);
  }

  // Signals endpoints
  async getSignals(params?: { limit?: number; status?: string }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);
    
    const queryString = query.toString();
    return this.request<any[]>(`/signals${queryString ? `?${queryString}` : ''}`);
  }

  // Trades endpoints
  async getTrades(params?: { limit?: number; underlying?: string; side?: string; startDate?: string; endDate?: string; offset?: number; includeAnalytics?: boolean }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.underlying) query.set('underlying', params.underlying);
    if (params?.side) query.set('side', params.side);
    if (params?.startDate) query.set('start_date', params.startDate);
    if (params?.endDate) query.set('end_date', params.endDate);
    if (params?.offset) query.set('offset', params.offset.toString());
    if (params?.includeAnalytics) query.set('analytics', 'true');
    
    const queryString = query.toString();
    return this.request<any[]>(`/trades${queryString ? `?${queryString}` : ''}`);
  }

  // Analytics endpoint
  async getAnalytics(period?: string) {
    const query = period ? `?period=${encodeURIComponent(period)}` : '';
    return this.request<any>(`/analytics${query}`);
  }

  // Exit signals endpoint
  async getExitSignals(refresh = false) {
    const endpoint = refresh ? '/exit-signals?refresh=true' : '/exit-signals';
    return this.request<any[]>(endpoint);
  }

  async getOrders(params?: { limit?: number; status?: string }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.status) query.set('status', params.status);
    const queryString = query.toString();
    return this.request<any[]>(`/orders${queryString ? `?${queryString}` : ''}`);
  }

  async cancelOrder(orderId: string) {
    return this.request<any>(`/orders/${orderId}/cancel`, {
      method: 'POST',
    });
  }

  async getMarketContext(ticker: string) {
    return this.request<any>(`/market-context?ticker=${encodeURIComponent(ticker)}`);
  }

  async getMarketContexts(limit = 50) {
    return this.request<any>(`/market-context?limit=${limit}`);
  }

  async getMarketPositioning(underlying: string, expiration: string, quick = false) {
    const query = new URLSearchParams({
      underlying,
      expiration,
      ...(quick ? { quick: 'true' } : {}),
    });
    return this.request<any>(`/market-positioning?${query.toString()}`);
  }

  // Metrics endpoint
  async getMetrics() {
    return this.request<any>('/metrics');
  }

  // MTF Analysis endpoint
  async getMtfAnalysis(symbol: string) {
    return this.request<any>(`/mtf-analysis?symbol=${symbol}`);
  }

  // Webhook endpoint (for testing)
  async sendWebhook(payload: any) {
    return this.request<any>('/webhook', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Auth endpoints
  async register(email: string, password: string) {
    return this.request<{ token: string; user: { id: string; email: string } }>(`/auth?action=register`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ token: string; user: { id: string; email: string } }>(`/auth?action=login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request<{ user: { id: string; email: string } }>(`/auth?action=me`, {
      method: 'GET',
    });
  }

  async getExitRules(mode: string) {
    return this.request<{ rules: any }>(`/exit-rules?mode=${mode}`, {
      method: 'GET',
    });
  }

  async updateExitRules(mode: string, payload: Record<string, unknown>) {
    return this.request<{ rules: any }>(`/exit-rules?mode=${mode}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async getRiskLimits(mode: string) {
    return this.request<{ risk_limits: any }>(`/risk-limits?mode=${mode}`, {
      method: 'GET',
    });
  }

  async updateRiskLimits(mode: string, payload: Record<string, unknown>) {
    return this.request<{ risk_limits: any }>(`/risk-limits?mode=${mode}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

// Create singleton instance
export const apiClient = new ApiClient(API_URL);

// Export for use in components
export default apiClient;
