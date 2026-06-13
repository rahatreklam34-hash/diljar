import {
  Phone, MessageCircle, Megaphone, Tag, Glasses, ShoppingBag, Radio, Gift,
  Star, Heart, Send, Link2, Video, Package, Percent, Headphones,
  MapPin, Sparkles, Truck, CreditCard, Users, Bell, Globe, Share2, MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Landing Page butonlarinda kullanilabilecek ikon havuzu (admin secici + public render ortak kaynak)
export const LANDING_ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  message: MessageCircle,
  megaphone: Megaphone,
  tag: Tag,
  glasses: Glasses,
  bag: ShoppingBag,
  radio: Radio,
  gift: Gift,
  star: Star,
  heart: Heart,
  share: Share2,
  send: Send,
  link: Link2,
  video: Video,
  package: Package,
  percent: Percent,
  headphones: Headphones,
  pin: MapPin,
  sparkles: Sparkles,
  truck: Truck,
  card: CreditCard,
  users: Users,
  bell: Bell,
  globe: Globe,
  chat: MessageSquare,
};

export const LANDING_ICON_LIST = Object.keys(LANDING_ICONS);

export function landingIcon(name?: string): LucideIcon {
  return (name && LANDING_ICONS[name]) || Link2;
}
