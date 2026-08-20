import { type LucideIcon, Plane, Drama, IdCardLanyard, Handshake, MicVocal, Wrench, Network } from 'lucide-react';

export const SILO_DISPLAY_ORDER: string[] = ['HC1', 'HC2', 'HC3', 'CCC', 'PO', 'RO', 'CORE'];

export const siloIcons: Record<string, LucideIcon> = {
  CORE: Network,
  HC1:  Plane,
  HC2:  Drama,
  HC3:  IdCardLanyard,
  CCC:  Handshake,
  PO:   MicVocal,
  RO:   Wrench,
};

export const siloColors: Record<string, string> = {
  CORE: 'bg-teal-50 border-teal-200',
  HC1:  'bg-blue-50 border-blue-200',
  HC2:  'bg-teal-50 border-teal-200',
  HC3:  'bg-pink-50 border-pink-200',
  CCC:  'bg-forest-50 border-forest-200',
  PO:   'bg-amber-50 border-amber-200',
  RO:   'bg-cyan-50 border-cyan-200',
};

export const siloBadgeColors: Record<string, string> = {
  CORE: 'border-teal-200 text-teal-700',
  HC1:  'border-blue-300 text-blue-700',
  HC2:  'border-teal-300 text-teal-600',
  HC3:  'border-pink-300 text-pink-700',
  CCC:  'border-forest-300 text-forest-600',
  PO:   'border-amber-300 text-amber-700',
  RO:   'border-cyan-300 text-cyan-700',
};

// Override the active pill style for silos that need a solid fill (instead of the default light bg).
export const siloActivePillColors: Record<string, string> = {
  CORE: 'bg-teal-500 border-teal-500 text-white',
};
