export interface ExpectedDuration {
  min: number;
  max?: number;
}

// Parses an act's estimated play time from its plan markdown.
// Robust to the formats used across the campaign, e.g.:
//   "## Duración Estimada: 70–90 minutos"   (H2, "Estimada", en-dash, full word)
//   "### Duración estimada: 85-95 min (…)"  (H3, hyphen, abbreviation)
//   "## Duración estimada: 70 min"          (single value)
// Handles hyphen / en-dash / em-dash ranges and "min" | "minuto" | "minutos".
// Prefers an explicit "Duración [Estimada]:" heading so stray body mentions
// (e.g. "el ritual dura 5 minutos") don't shadow the act's real estimate;
// falls back to the first duration-like phrase anywhere.
export function parseExpectedDuration(
  content: string | null | undefined
): ExpectedDuration | null {
  if (!content) return null;

  const headerRe =
    /#{1,6}\s*Duraci[óo]n(?:\s+estimada)?\s*:?\s*(\d+)(?:\s*[-–—]\s*(\d+))?\s*min(?:uto)?s?\b/i;
  const generalRe = /(\d+)(?:\s*[-–—]\s*(\d+))?\s*min(?:uto)?s?\b/i;

  const match = content.match(headerRe) ?? content.match(generalRe);
  if (!match) return null;

  const min = parseInt(match[1], 10);
  if (Number.isNaN(min)) return null;
  const max = match[2] ? parseInt(match[2], 10) : undefined;
  return max !== undefined ? { min, max } : { min };
}
