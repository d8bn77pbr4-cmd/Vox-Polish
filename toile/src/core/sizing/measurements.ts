export type Profile = 'women' | 'men';
export interface Measurements {
  height: number; chest: number; waist: number; hip: number; neck: number; shoulder: number;
  backLength: number; armLength: number; bicep: number; wrist: number; inseam: number; rise: number;
  thigh: number; knee: number; head: number; footLength: number; footWidth: number;
}
export const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  'height', 'chest', 'waist', 'hip', 'neck', 'shoulder', 'backLength', 'armLength', 'bicep', 'wrist',
  'inseam', 'rise', 'thigh', 'knee', 'head', 'footLength', 'footWidth',
];
export const MEASUREMENT_LABELS: Record<keyof Measurements, string> = {
  height: 'Körpergröße', chest: 'Brustumfang', waist: 'Taillenumfang', hip: 'Hüftumfang', neck: 'Halsumfang',
  shoulder: 'Schulterbreite', backLength: 'Rückenlänge', armLength: 'Armlänge', bicep: 'Oberarmumfang',
  wrist: 'Handgelenkumfang', inseam: 'Schrittlänge', rise: 'Leibhöhe', thigh: 'Oberschenkelumfang',
  knee: 'Knieumfang', head: 'Kopfumfang', footLength: 'Fußlänge', footWidth: 'Fußbreite',
};
