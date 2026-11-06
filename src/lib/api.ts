import { isSupabaseConfigured, supabase } from './supabase';
import type {
  AuthUser,
  ChatMessage,
  GeoCenter,
  Kaarigar,
  PlaceSuggestion,
  PlacedOrder,
  ProviderDashboardData,
} from '../types';

const TOKEN_KEY = 'kaarigar_session_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ==================== AUTH ====================

export async function registerUser(payload: {
  name: string;
  phone: string;
  pin: string;
  role: 'customer' | 'kaarigar';
}): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Could not create account');
  setAuthToken(json.token);
  return json.user as AuthUser;
}

export async function loginUser(payload: {
  phone: string;
  pin: string;
}): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Invalid mobile number or PIN');
  setAuthToken(json.token);
  return json.user as AuthUser;
}

export async function logoutUser(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: authHeaders(),
  }).catch(() => {});
  setAuthToken(null);
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getAuthToken()) return null;
  const res = await fetch('/api/auth/me', { headers: authHeaders() });
  if (!res.ok) {
    setAuthToken(null);
    return null;
  }
  const json = await res.json();
  return json.user as AuthUser;
}

// ==================== PLACES AUTOCOMPLETE & REVERSE GEOCODE ====================

export async function fetchPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.suggestions ?? []) as PlaceSuggestion[];
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoCenter> {
  const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    return { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  }
  return (await res.json()) as GeoCenter;
}

export async function geocodeArea(areaQuery: string): Promise<GeoCenter | null> {
  const suggestions = await fetchPlaceSuggestions(areaQuery);
  if (suggestions.length > 0) {
    return {
      lat: suggestions[0].lat,
      lng: suggestions[0].lng,
      label: suggestions[0].label,
    };
  }
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(areaQuery)}`);
  if (!res.ok) return null;
  return (await res.json()) as GeoCenter;
}

// ==================== NEARBY KAARIGARS ====================

export async function fetchNearbyKaarigars(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  query: string;
  sort: 'd' | 'r' | 'p';
}): Promise<Kaarigar[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('nearby_kaarigars', {
      user_lat: params.lat,
      user_lng: params.lng,
      max_radius_km: params.radiusKm,
    });
    if (!error && Array.isArray(data)) {
      const ids = data.map((d: any) => d.id);
      const [{ data: svcs }, { data: photos }, { data: revs }] = await Promise.all([
        supabase.from('services').select('*').in('kaarigar_id', ids).order('sort_order'),
        supabase.from('kaarigar_photos').select('*').in('kaarigar_id', ids),
        supabase.from('reviews').select('*').in('kaarigar_id', ids).order('created_at', { ascending: false }),
      ]);

      let list: Kaarigar[] = data.map((row: any) => ({
        id: row.id,
        businessName: row.business_name,
        ownerName: row.owner_name,
        emoji: row.emoji,
        themeColor: row.theme_color,
        areaName: row.area_name,
        maskedLat: row.masked_lat,
        maskedLng: row.masked_lng,
        distanceKm: Number(row.distance_km),
        serviceRadiusKm: Number(row.service_radius_km),
        openTime: row.open_time,
        closeTime: row.close_time,
        isOpen: row.is_open,
        dailyCap: row.daily_cap,
        ordersToday: Number(row.orders_today ?? 0),
        takingOrders: Boolean(row.taking_orders),
        idVerified: row.id_verified,
        rating: Number(row.rating),
        reviewCount: row.review_count,
        trustScore: row.trust_score,
        services: (svcs ?? [])
          .filter((s: any) => s.kaarigar_id === row.id)
          .map((s: any) => ({ id: s.id, title: s.title, priceInr: s.price_inr })),
        photos: (photos ?? []).filter((p: any) => p.kaarigar_id === row.id).map((p: any) => p.url),
        reviews: (revs ?? [])
          .filter((r: any) => r.kaarigar_id === row.id)
          .map((r: any) => ({
            id: r.id,
            customerName: r.customer_name,
            rating: r.rating,
            comment: r.comment,
            photoUrl: r.photo_url,
            createdAt: r.created_at,
          })),
      }));

      const q = params.query.trim().toLowerCase();
      if (q) {
        const words = q.split(/\s+/).filter(Boolean);
        list = list.filter((k) => {
          const hay = `${k.businessName} ${k.ownerName} ${k.areaName} ${k.services.map((s) => s.title).join(' ')}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        });
      }
      const lo = (k: Kaarigar) => (k.services.length ? Math.min(...k.services.map((s) => s.priceInr)) : 99999);
      list.sort((a, b) =>
        params.sort === 'r'
          ? b.rating - a.rating
          : params.sort === 'p'
            ? lo(a) - lo(b)
            : a.distanceKm - b.distanceKm
      );
      return list;
    }
  }

  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    radius: String(params.radiusKm),
    q: params.query,
    sort: params.sort,
  });
  const res = await fetch(`/api/kaarigars?${qs.toString()}`);
  if (!res.ok) throw new Error('Failed to load nearby kaarigars');
  const json = await res.json();
  return json.kaarigars as Kaarigar[];
}

// ==================== AUTHENTICATED ONBOARDING, ORDERS & SELF DASHBOARD ====================

export async function onboardKaarigar(payload: {
  businessName: string;
  emoji: string;
  themeColor: string;
  areaName: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  openTime: string;
  closeTime: string;
  dailyCap: number;
  idVerified: boolean;
  services: Array<{ title: string; priceInr: number }>;
  photos: string[];
}): Promise<Kaarigar> {
  const res = await fetch('/api/kaarigars', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to register kaarigar');
  return json.kaarigar as Kaarigar;
}

export async function createOrder(payload: {
  kaarigarId: string;
  serviceId: string;
  quantity: number;
  fulfilmentType: 'pickup' | 'delivery';
  paymentMethod: 'upi' | 'cod';
  customerNote: string;
}): Promise<PlacedOrder> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Could not place order');
  return json.order as PlacedOrder;
}

export async function fetchMyOrders(): Promise<PlacedOrder[]> {
  const res = await fetch('/api/me/orders', { headers: authHeaders() });
  if (!res.ok) throw new Error('Please log in to view your orders');
  const json = await res.json();
  return json.orders as PlacedOrder[];
}

export async function fetchOrderMessages(orderId: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/orders/${orderId}/messages`, { headers: authHeaders() });
  if (!res.ok) return [];
  const json = await res.json();
  return json.messages as ChatMessage[];
}

export async function sendOrderMessage(orderId: string, body: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/orders/${orderId}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to send message');
  return json.messages as ChatMessage[];
}

export async function submitOrderReview(
  orderId: string,
  payload: {
    rating: number;
    comment: string;
    photoDataUrl?: string | null;
  }
): Promise<{ rating: number; reviewCount: number; trustScore: number }> {
  const res = await fetch(`/api/orders/${orderId}/review`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to submit review');
  return json;
}

export async function fetchMyDashboard(): Promise<ProviderDashboardData> {
  const res = await fetch('/api/me/dashboard', { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to load your dashboard');
  return json as ProviderDashboardData;
}

export async function updateMySettings(
  payload: Partial<{
    isOpen: boolean;
    dailyCap: number;
    openTime: string;
    closeTime: string;
    serviceRadiusKm: number;
  }>
): Promise<void> {
  const res = await fetch('/api/me/settings', {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to update settings');
}

export async function updateOrderStatus(
  orderId: string,
  status: 'placed' | 'accepted' | 'ready' | 'completed' | 'cancelled'
): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ status }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to update order status');
}
