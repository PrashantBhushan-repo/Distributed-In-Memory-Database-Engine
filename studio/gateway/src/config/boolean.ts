import { z } from 'zod';

// Boolean("false") is true. Environment flags must parse their literal value.
export const environmentBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (['true', '1'].includes(value.toLowerCase())) return true;
  if (['false', '0', ''].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());
