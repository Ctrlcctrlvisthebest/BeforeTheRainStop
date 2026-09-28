/** The extension-whitelist fallback contains neither audio assets nor controls. */
export const useGameAudio = (_inGame?: boolean) => ({
  start: async () => {},
  effect: (_frequency: number) => {},
  cue: (_name: string) => {},
  effectsEnabled: false,
  effectsVolume: 0,
  toggleEffects: () => {},
  setEffectsVolume: (_volume: number) => {},
});
export const MusicControls = () => null;
