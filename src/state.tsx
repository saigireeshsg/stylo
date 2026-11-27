import { createContext, useContext } from 'react';
import type { Profile, Row } from './lib/store';
import type { Product } from './lib/catalog';
import type { BodyProfile } from './lib/body';
import type { ColorProfile } from './lib/color';
import type { Taste } from './lib/recommend';

export interface AppState {
  profile: Profile | null;
  body: BodyProfile | null;
  color: ColorProfile | null;
  photos: Row[];
  catalog: Product[];
  interactions: Row[];
  taste: Taste;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
  startTryOn: (items: Product[] | null, saved?: Row, sceneId?: string) => void;
  go: (tab: Tab) => void;
  studioSeed: { items?: Product[]; sceneId?: string; nonce: number } | null;
}
export type Tab = 'studio' | 'style' | 'saved' | 'tryon' | 'chat' | 'me';
export const Ctx = createContext<AppState>(null as any);
export const useApp = () => useContext(Ctx);
