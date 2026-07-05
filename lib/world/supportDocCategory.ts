/**
 * Categorises an ActRunner support doc by the subfolder its FileReference.path
 * comes from, so the runner can group the "Fichas" dropdown into readable
 * sections. World support docs arrive prefixed
 * `mundo/lugares/<id>/<subfolder>/<file>.md` (see lib/world/worldScanner +
 * lib/sessionScanner collectPathSupportContent), so the segment we key off is
 * `characters/`, `threats/`, or `maps/` anywhere in the path. Everything else
 * (e.g. flat `plan/` acts split into parts) falls back to "Otros".
 */
export type SupportDocCategory = 'personajes' | 'amenazas' | 'mapas' | 'otros';

/** The fixed display order of the grouped sections in the dropdown. */
export const SUPPORT_DOC_CATEGORY_ORDER: readonly SupportDocCategory[] = [
  'personajes',
  'amenazas',
  'mapas',
  'otros',
] as const;

export const SUPPORT_DOC_CATEGORY_LABEL: Record<SupportDocCategory, string> = {
  personajes: 'Personajes',
  amenazas: 'Amenazas',
  mapas: 'Mapas (ASCII)',
  otros: 'Otros',
};

/**
 * Infers the section for a support doc from its path. Matches the folder
 * segment case-insensitively and only as a whole path segment (`/characters/`
 * or a leading `characters/`) so a place literally named `.../characters.../`
 * file can't be misread.
 */
export function categorizeSupportDoc(path: string): SupportDocCategory {
  const segments = path.toLowerCase().split('/');
  if (segments.includes('characters')) return 'personajes';
  if (segments.includes('threats')) return 'amenazas';
  if (segments.includes('maps')) return 'mapas';
  return 'otros';
}
