import {
  Globe, Star, Heart, Bookmark, Link as LinkIcon, ExternalLink, Mail, MessageSquare,
  Phone, Video, Music, Film, Image, Camera, Tv, Radio,
  ShoppingCart, ShoppingBag, CreditCard, Wallet, DollarSign, Briefcase,
  Newspaper, BookOpen, GraduationCap, Library, FileText, PenTool,
  Cloud, Sun, Moon, Umbrella, Map as MapIcon, Compass, Plane, Car,
  Train, Bus, Bike, Ship, Home, Building, Hotel, Coffee,
  Utensils, Pizza, Wine, Gift, Gamepad2, Trophy, Dumbbell, Activity,
  Code, Terminal, Cpu, Database, Server, Github, Youtube, Twitter,
  Facebook, Instagram, Linkedin, Twitch, Rss, Search, Settings, Wrench,
  Calendar, Clock, AlertCircle, Bell, Lock, Key, Shield, Zap,
  Lightbulb, Flame, Leaf, Trees, Flower2, Dog, Cat, Fish,
} from "lucide-react";
import type { ComponentType } from "react";

export const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  Globe, Star, Heart, Bookmark, LinkIcon, ExternalLink, Mail, MessageSquare,
  Phone, Video, Music, Film, Image, Camera, Tv, Radio,
  ShoppingCart, ShoppingBag, CreditCard, Wallet, DollarSign, Briefcase,
  Newspaper, BookOpen, GraduationCap, Library, FileText, PenTool,
  Cloud, Sun, Moon, Umbrella, MapIcon, Compass, Plane, Car,
  Train, Bus, Bike, Ship, Home, Building, Hotel, Coffee,
  Utensils, Pizza, Wine, Gift, Gamepad2, Trophy, Dumbbell, Activity,
  Code, Terminal, Cpu, Database, Server, Github, Youtube, Twitter,
  Facebook, Instagram, Linkedin, Twitch, Rss, Search, Settings, Wrench,
  Calendar, Clock, AlertCircle, Bell, Lock, Key, Shield, Zap,
  Lightbulb, Flame, Leaf, Trees, Flower2, Dog, Cat, Fish,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function getIcon(name: string | null | undefined) {
  if (!name) return Globe;
  return ICON_MAP[name] ?? Globe;
}
