import {
  Briefcase,
  GraduationCap,
  MessageCircle,
  PencilLine,
  Plane,
  ShoppingBag,
  Siren,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import type { ScenarioId } from '../../data/dailyScenarios';

export const SCENARIO_ICONS: Record<ScenarioId, LucideIcon> = {
  healthcare: Stethoscope,
  shopping: ShoppingBag,
  college: GraduationCap,
  workplace: Briefcase,
  travel: Plane,
  everyday: MessageCircle,
  emergency: Siren,
  custom: PencilLine,
};
