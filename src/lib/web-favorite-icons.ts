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
  // 50 ekstra "farge-ikoner"
  Apple, Banana, Cherry, Grape, Carrot, IceCream, CakeSlice, Cookie, Beer, Martini,
  Sailboat, Rocket, Anchor, Mountain, Tent, Snowflake, CloudRain, CloudLightning, Rainbow, Droplet,
  PartyPopper, Sparkles, Crown, Gem, Award, Medal, Flag, Palette, Brush, Pencil,
  Smile, Ghost, Bug, Bird, Rabbit, Squirrel, Turtle, Snail, Worm, Egg,
  Smartphone, Laptop, Monitor, Headphones, Speaker, Mic, Printer, Save, Folder, Inbox,
  // 50 nye "emoji-aktige" farge-ikoner
  Pizza as PizzaSlice, Croissant, Donut, Sandwich, Soup, Salad, Beef, Ham, Drumstick, EggFried,
  Candy, Lollipop, Popcorn, Popsicle, Milk, CupSoda, GlassWater, Citrus, Grape as GrapeIcon, Cherry as CherryIcon,
  Sun as SunIcon, Moon as MoonIcon, Star as StarIcon, CloudSun, CloudMoon, CloudSnow, CloudFog, Wind, Tornado, Waves,
  Heart as HeartIcon, HeartHandshake, Smile as SmileIcon, Laugh, Angry, Frown, Meh, ThumbsUp, ThumbsDown, HandHeart,
  Bone, PawPrint, Shell, Sprout, TreePalm, TreePine, Flower, Cake, PartyPopper as Party2, Trophy as TrophyIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string; color?: string }>> = {
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
  Apple, Banana, Cherry, Grape, Carrot, IceCream, CakeSlice, Cookie, Beer, Martini,
  Sailboat, Rocket, Anchor, Mountain, Tent, Snowflake, CloudRain, CloudLightning, Rainbow, Droplet,
  PartyPopper, Sparkles, Crown, Gem, Award, Medal, Flag, Palette, Brush, Pencil,
  Smile, Ghost, Bug, Bird, Rabbit, Squirrel, Turtle, Snail, Worm, Egg,
  Smartphone, Laptop, Monitor, Headphones, Speaker, Mic, Printer, Save, Folder, Inbox,
};

// Forhåndsdefinerte farger for de 50 nye ikonene (resten arver currentColor).
export const ICON_COLOR: Record<string, string> = {
  Apple: "#e53935", Banana: "#fdd835", Cherry: "#c2185b", Grape: "#7b1fa2", Carrot: "#fb8c00",
  IceCream: "#f48fb1", CakeSlice: "#ec407a", Cookie: "#8d6e63", Beer: "#fbc02d", Martini: "#26c6da",
  Sailboat: "#1e88e5", Rocket: "#ef5350", Anchor: "#455a64", Mountain: "#6d4c41", Tent: "#43a047",
  Snowflake: "#4fc3f7", CloudRain: "#42a5f5", CloudLightning: "#ffca28", Rainbow: "#ab47bc", Droplet: "#29b6f6",
  PartyPopper: "#f06292", Sparkles: "#ffd54f", Crown: "#ffb300", Gem: "#26c6da", Award: "#fdd835",
  Medal: "#ffa000", Flag: "#e53935", Palette: "#ab47bc", Brush: "#7e57c2", Pencil: "#ffb74d",
  Smile: "#fdd835", Ghost: "#b0bec5", Bug: "#8bc34a", Bird: "#29b6f6", Rabbit: "#bcaaa4",
  Squirrel: "#a1887f", Turtle: "#66bb6a", Snail: "#9e9d24", Worm: "#ff8a65", Egg: "#fff59d",
  Smartphone: "#42a5f5", Laptop: "#90a4ae", Monitor: "#7986cb", Headphones: "#ec407a", Speaker: "#26a69a",
  Mic: "#ef5350", Printer: "#78909c", Save: "#5c6bc0", Folder: "#ffa726", Inbox: "#26c6da",
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export function getIcon(name: string | null | undefined) {
  if (!name) return Globe;
  return ICON_MAP[name] ?? Globe;
}

export function getIconColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return ICON_COLOR[name];
}

/** Hjelper: domene-favicon URL via Google s2-tjenesten. */
export function faviconUrl(url: string, size = 64): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=${size}`;
  } catch {
    return null;
  }
}

/** Spesiell ikon-verdi: bruk nettsidens eget favicon. */
export const FAVICON_ICON = "__favicon";
