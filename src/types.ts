export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: 'customer' | 'kaarigar';
  kaarigarId: string | null;
  businessName: string | null;
}

export interface PlaceSuggestion {
  lat: number;
  lng: number;
  label: string;
  source?: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  priceInr: number;
}

export interface ReviewItem {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  photoUrl?: string | null;
  createdAt: string;
}

export interface Kaarigar {
  id: string;
  businessName: string;
  ownerName: string;
  emoji: string;
  themeColor: string;
  areaName: string;
  maskedLat: number;
  maskedLng: number;
  distanceKm: number;
  serviceRadiusKm: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
  dailyCap: number;
  ordersToday: number;
  takingOrders: boolean;
  idVerified: boolean;
  rating: number;
  reviewCount: number;
  trustScore: number;
  services: ServiceItem[];
  photos: string[];
  reviews: ReviewItem[];
}

export interface PlacedOrder {
  id: string;
  kaarigarId: string;
  businessName: string;
  ownerName: string;
  emoji?: string;
  unlockedPhone: string;
  pickupArea: string;
  serviceTitle: string;
  unitPrice: number;
  quantity: number;
  totalInr: number;
  fulfilmentType: 'pickup' | 'delivery';
  paymentMethod: 'upi' | 'cod';
  customerNote: string;
  status: string;
  createdAt?: string;
  hasReview?: boolean;
}

export interface ChatMessage {
  id: string;
  orderId?: string;
  sender: 'customer' | 'kaarigar';
  body: string;
  createdAt?: string;
}

export interface GeoCenter {
  lat: number;
  lng: number;
  label: string;
}

export interface ProviderOrder {
  id: string;
  serviceTitle: string;
  unitPrice: number;
  quantity: number;
  totalInr: number;
  commissionInr: number;
  netPayoutInr: number;
  fulfilmentType: 'pickup' | 'delivery';
  paymentMethod: 'upi' | 'cod';
  customerName: string;
  customerNote: string;
  status: 'placed' | 'accepted' | 'ready' | 'completed' | 'cancelled';
  createdAt: string;
  messages: ChatMessage[];
}

export interface ProviderDashboardData {
  provider: {
    id: string;
    businessName: string;
    ownerName: string;
    phone: string;
    emoji: string;
    themeColor: string;
    areaName: string;
    serviceRadiusKm: number;
    openTime: string;
    closeTime: string;
    isOpen: boolean;
    dailyCap: number;
    ordersToday: number;
    trustScore: number;
    rating: number;
    reviewCount: number;
  };
  earnings: {
    grossInr: number;
    commissionInr: number;
    netEarningsInr: number;
    commissionRatePct: number;
    nextPayoutLabel: string;
  };
  orders: ProviderOrder[];
}
