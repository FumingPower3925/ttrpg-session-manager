/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { parseExpectedDuration } from './duration';

describe('parseExpectedDuration', () => {
  test('trunk format: H2 "Duración Estimada", en-dash, "minutos"', () => {
    expect(parseExpectedDuration('## Duración Estimada: 70–90 minutos')).toEqual({ min: 70, max: 90 });
  });

  test('branch format: H3 "Duración estimada", hyphen, "min" + trailing text', () => {
    expect(parseExpectedDuration('### Duración estimada: 85-95 min (skill challenge)')).toEqual({ min: 85, max: 95 });
  });

  test('single value (no range)', () => {
    expect(parseExpectedDuration('## Duración estimada: 70 min')).toEqual({ min: 70 });
  });

  test('em-dash range with trailing " — TITLE"', () => {
    expect(parseExpectedDuration('### Duración estimada: 60—80 min — CLÍMAX DE DECISIÓN')).toEqual({ min: 60, max: 80 });
  });

  test('prefers the Duración heading over stray body durations', () => {
    const content = 'Intro.\nEl ritual dura 5 minutos.\n\n### Duración estimada: 75-85 min\nluego 10 minutos más';
    expect(parseExpectedDuration(content)).toEqual({ min: 75, max: 85 });
  });

  test('falls back to the first duration phrase when there is no heading', () => {
    expect(parseExpectedDuration('...esto lleva 15-20 minutos en total...')).toEqual({ min: 15, max: 20 });
  });

  test('returns null when there is no duration / empty / null', () => {
    expect(parseExpectedDuration('no time indicated here')).toBeNull();
    expect(parseExpectedDuration('')).toBeNull();
    expect(parseExpectedDuration(null)).toBeNull();
    expect(parseExpectedDuration(undefined)).toBeNull();
  });
});
