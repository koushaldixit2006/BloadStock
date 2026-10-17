import { Hospital } from '../types/domain';

export const HOSPITALS: Hospital[] = [
  {
    id: 'H1',
    name: 'Pink City General',
    shortName: 'Pink City',
    coords: { x: 400, y: 250 },
    tier: 'Regional Hub',
  },
  {
    id: 'H2',
    name: 'Aravali Medical Centre',
    shortName: 'Aravali',
    coords: { x: 180, y: 170 },
    tier: 'General Hospital',
  },
  {
    id: 'H3',
    name: 'Amber Heart Institute',
    shortName: 'Amber Heart',
    coords: { x: 620, y: 110 },
    tier: 'Heart Institute',
  },
  {
    id: 'H4',
    name: 'Sawai Care Hospital',
    shortName: 'Sawai Care',
    coords: { x: 260, y: 390 },
    tier: 'Care Centre',
  },
  {
    id: 'H5',
    name: 'Rampura Trauma Centre',
    shortName: 'Rampura',
    coords: { x: 650, y: 360 },
    tier: 'Trauma Centre',
  },
];

export const HOSPITAL_MAP = new Map<string, Hospital>(
  HOSPITALS.map((h) => [h.id, h])
);

export function getHospitalName(id: string): string {
  return HOSPITAL_MAP.get(id)?.name ?? id;
}

export function getHospitalShortName(id: string): string {
  return HOSPITAL_MAP.get(id)?.shortName ?? id;
}
