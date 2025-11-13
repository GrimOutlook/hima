import { LucideIcon } from 'lucide-react';
import { ZodType } from 'zod';

export type FormStep = {
  title: string;
  validationSchema: ZodType<unknown>;
  component: React.ReactElement;
  icon: LucideIcon;
};
