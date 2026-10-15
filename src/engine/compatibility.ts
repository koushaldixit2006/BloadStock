import { BloodGroup, Component } from '../types/domain';

/**
 * SIMPLIFIED SYNTHETIC COMPATIBILITY RULES
 * ========================================
 * NOTE: This is a synthetic, simplified decision-support model built for
 * demonstration and planning logistics simulation ONLY. It is NOT clinical guidance
 * and MUST NEVER be used for actual clinical or transfusion decisions.
 */

export const ALL_BLOOD_GROUPS: BloodGroup[] = [
  'O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+',
];

// Helper to strip Rh factor to pure ABO
function getABO(group: BloodGroup): 'O' | 'A' | 'B' | 'AB' {
  if (group.startsWith('AB')) return 'AB';
  if (group.startsWith('A')) return 'A';
  if (group.startsWith('B')) return 'B';
  return 'O';
}

/**
 * Red blood cells compatibility table
 * Key: Recipient Group -> Array of acceptable Donor Groups
 * Rule: Standard ABO/Rh. Rh- recipients accept only Rh- donors.
 * O- is universal donor, AB+ is universal recipient.
 */
const RED_CELLS_RECIPIENT_ACCEPTABLE: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

/**
 * Plasma compatibility table (Reverse ABO table, Rh ignored)
 * Key: Recipient ABO -> Acceptable Donor ABOs
 * AB donor has no antibodies -> universal donor for plasma.
 * O recipient has no antigens -> universal recipient for plasma.
 */
const PLASMA_RECIPIENT_ACCEPTABLE: Record<'O' | 'A' | 'B' | 'AB', ('O' | 'A' | 'B' | 'AB')[]> = {
  'O': ['O', 'A', 'B', 'AB'], // Accepts all donor ABOs
  'A': ['A', 'AB'],
  'B': ['B', 'AB'],
  'AB': ['AB'],               // AB plasma only
};

/**
 * Check whether a donor unit is compatible with a recipient request.
 */
export function isCompatible(
  component: Component,
  donorGroup: BloodGroup,
  recipientGroup: BloodGroup
): boolean {
  if (component === 'RED_CELLS') {
    const acceptable = RED_CELLS_RECIPIENT_ACCEPTABLE[recipientGroup];
    return acceptable ? acceptable.includes(donorGroup) : false;
  }

  if (component === 'PLASMA') {
    const recABO = getABO(recipientGroup);
    const donABO = getABO(donorGroup);
    const acceptable = PLASMA_RECIPIENT_ACCEPTABLE[recABO];
    return acceptable ? acceptable.includes(donABO) : false;
  }

  if (component === 'PLATELETS') {
    // Simplified rule: ABO-identical, Rh ignored
    return getABO(donorGroup) === getABO(recipientGroup);
  }

  return false;
}

/**
 * Get all compatible donor groups for a given component and recipient group.
 */
export function getCompatibleDonors(
  component: Component,
  recipientGroup: BloodGroup
): BloodGroup[] {
  return ALL_BLOOD_GROUPS.filter((donor) =>
    isCompatible(component, donor, recipientGroup)
  );
}

/**
 * Get all compatible recipient groups that can receive this donor group.
 */
export function getCompatibleRecipients(
  component: Component,
  donorGroup: BloodGroup
): BloodGroup[] {
  return ALL_BLOOD_GROUPS.filter((recipient) =>
    isCompatible(component, donorGroup, recipient)
  );
}
