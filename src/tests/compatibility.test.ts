import { describe, expect, it } from 'vitest';
import { ALL_BLOOD_GROUPS, getCompatibleDonors, getCompatibleRecipients, isCompatible } from '../engine/compatibility';

describe('Compatibility Rules (Synthetic Model)', () => {
  describe('Red Blood Cells', () => {
    it('O- is the universal donor for red cells', () => {
      for (const recipient of ALL_BLOOD_GROUPS) {
        expect(isCompatible('RED_CELLS', 'O-', recipient)).toBe(true);
      }
    });

    it('AB+ is the universal recipient for red cells', () => {
      for (const donor of ALL_BLOOD_GROUPS) {
        expect(isCompatible('RED_CELLS', donor, 'AB+')).toBe(true);
      }
    });

    it('Rh- recipients never accept Rh+ red cells', () => {
      const rhNegativeRecipients = ['O-', 'A-', 'B-', 'AB-'] as const;
      const rhPositiveDonors = ['O+', 'A+', 'B+', 'AB+'] as const;

      for (const rec of rhNegativeRecipients) {
        for (const don of rhPositiveDonors) {
          expect(isCompatible('RED_CELLS', don, rec)).toBe(false);
        }
      }
    });

    it('O- recipient only accepts O- red cells', () => {
      const donors = getCompatibleDonors('RED_CELLS', 'O-');
      expect(donors).toEqual(['O-']);
    });

    it('A- recipient accepts O- and A- red cells', () => {
      const donors = getCompatibleDonors('RED_CELLS', 'A-');
      expect(donors.sort()).toEqual(['A-', 'O-'].sort());
    });
  });

  describe('Plasma (Reverse ABO table, Rh ignored)', () => {
    it('AB donors are compatible with all plasma recipients', () => {
      for (const recipient of ALL_BLOOD_GROUPS) {
        expect(isCompatible('PLASMA', 'AB+', recipient)).toBe(true);
        expect(isCompatible('PLASMA', 'AB-', recipient)).toBe(true);
      }
    });

    it('O recipient can accept plasma from all ABO groups', () => {
      for (const donor of ALL_BLOOD_GROUPS) {
        expect(isCompatible('PLASMA', donor, 'O+')).toBe(true);
        expect(isCompatible('PLASMA', donor, 'O-')).toBe(true);
      }
    });

    it('AB recipient can only receive AB plasma', () => {
      const donors = getCompatibleDonors('PLASMA', 'AB+');
      expect(donors.sort()).toEqual(['AB-', 'AB+'].sort());
    });

    it('A donor cannot give plasma to B or AB recipients', () => {
      expect(isCompatible('PLASMA', 'A+', 'B+')).toBe(false);
      expect(isCompatible('PLASMA', 'A-', 'AB-')).toBe(false);
    });
  });

  describe('Platelets (ABO-identical, Rh ignored)', () => {
    it('requires ABO-identical groups regardless of Rh', () => {
      expect(isCompatible('PLATELETS', 'O-', 'O+')).toBe(true);
      expect(isCompatible('PLATELETS', 'O+', 'O-')).toBe(true);
      expect(isCompatible('PLATELETS', 'A+', 'A-')).toBe(true);
      expect(isCompatible('PLATELETS', 'B-', 'B+')).toBe(true);
      expect(isCompatible('PLATELETS', 'AB+', 'AB-')).toBe(true);

      // Incompatible if ABO differs
      expect(isCompatible('PLATELETS', 'O+', 'A+')).toBe(false);
      expect(isCompatible('PLATELETS', 'A-', 'B-')).toBe(false);
      expect(isCompatible('PLATELETS', 'AB+', 'O+')).toBe(false);
    });

    it('compatible donors for O- platelets are O- and O+', () => {
      const donors = getCompatibleDonors('PLATELETS', 'O-');
      expect(donors.sort()).toEqual(['O-', 'O+'].sort());
    });
  });

  describe('Query functions coverage', () => {
    it('getCompatibleRecipients returns non-empty list for all valid donor groups', () => {
      for (const group of ALL_BLOOD_GROUPS) {
        expect(getCompatibleRecipients('RED_CELLS', group).length).toBeGreaterThan(0);
        expect(getCompatibleRecipients('PLASMA', group).length).toBeGreaterThan(0);
        expect(getCompatibleRecipients('PLATELETS', group).length).toBeGreaterThan(0);
      }
    });
  });
});
