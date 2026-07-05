import { describe, expect, it } from 'bun:test';
import {
  categorizeSupportDoc,
  SUPPORT_DOC_CATEGORY_LABEL,
  SUPPORT_DOC_CATEGORY_ORDER,
} from './supportDocCategory';

describe('categorizeSupportDoc', () => {
  it('reads characters/ as personajes', () => {
    expect(categorizeSupportDoc('mundo/lugares/porto_verne/characters/kael_voss.md')).toBe(
      'personajes'
    );
  });

  it('reads threats/ as amenazas', () => {
    expect(categorizeSupportDoc('mundo/lugares/porto_verne/threats/dron_aduanas.md')).toBe(
      'amenazas'
    );
  });

  it('reads maps/ markdown as mapas', () => {
    expect(categorizeSupportDoc('mundo/lugares/porto_verne/maps/plano_ascii.md')).toBe('mapas');
  });

  it('falls back to otros for anything else', () => {
    expect(categorizeSupportDoc('mundo/lugares/porto_verne/plan/acto2.md')).toBe('otros');
    expect(categorizeSupportDoc('notas.md')).toBe('otros');
  });

  it('matches the folder as a whole segment, case-insensitively', () => {
    expect(categorizeSupportDoc('X/Characters/a.md')).toBe('personajes');
    // A substring that is not its own segment must NOT match.
    expect(categorizeSupportDoc('mundo/lugares/mapas_del_sur/notas.md')).toBe('otros');
  });

  it('exposes a label for every ordered category', () => {
    for (const cat of SUPPORT_DOC_CATEGORY_ORDER) {
      expect(SUPPORT_DOC_CATEGORY_LABEL[cat]).toBeTruthy();
    }
  });
});
