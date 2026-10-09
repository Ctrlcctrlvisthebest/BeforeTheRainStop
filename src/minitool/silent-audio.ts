/** The extension-whitelist fallback contains neither audio assets nor controls. */
export const useGameAudio = (_inGame?: boolean) => ({
  start: async () => {},
  effect: (_frequency: number) => {},
  cue: (_name: string) => {},
});
export const MusicControls = () => null;
