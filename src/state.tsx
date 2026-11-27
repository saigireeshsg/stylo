import { createContext, useContext } from 'react';
import type { Profile, Row } from './lib/store';
import type { Product } from './lib/catalog';
import type { BodyProfile } from './lib/body';
import type { ColorProfile } from './lib/color';
import type { Taste } from './lib/recommend';

export type Tab = 'home' | 'looks' | 'saved' | 'me' | 'chat';
export interface Route { situation?: string; seed?: Product[]; nonce?: number }

export interface AppState {
  profile: Profile | null;
  body: BodyProfile | null;
  color: ColorProfile | null;
  photos: Row[];
  catalog: Product[];
  catalogReady: boolean;
  interactions: Row[];
  taste: Taste;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
  go: (tab: Tab) => void;
  /** Open a situation (Office, Casual…), optionally seeded with pieces to wear. */
  openSituation: (id: string, seed?: Product[]) => void;
  route: Route;
  closeSituation: () => void;
}
export const Ctx = createContext<AppState>(null as any);
export const useApp = () => useContext(Ctx);
