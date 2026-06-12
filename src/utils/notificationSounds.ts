// Procedurally-synthesized notification sounds (Web Audio API) — no asset files,
// no licensing, works instantly. Each sound is a short, distinct cue the user
// can pick for live-trade toasts in Notification Settings.

export type NotificationSoundId =
  | "ping"
  | "bell"
  | "boom"
  | "coins"
  | "pop"
  | "chime"
  | "blip"
  | "drop";

export const NOTIFICATION_SOUNDS: { id: NotificationSoundId; label: string }[] = [
  { id: "ping", label: "Ping" },
  { id: "bell", label: "Bell" },
  { id: "chime", label: "Chime" },
  { id: "coins", label: "Coins" },
  { id: "pop", label: "Pop" },
  { id: "blip", label: "Blip" },
  { id: "boom", label: "Boom" },
  { id: "drop", label: "Drop" },
];

export const DEFAULT_NOTIFICATION_SOUND: NotificationSoundId = "ping";
export const NOTIFICATION_SOUND_STORAGE_KEY = "transaction-sound-choice";

let sharedCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!sharedCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    // Resume if the browser suspended it (autoplay policy) — safe no-op otherwise.
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

// One enveloped oscillator note.
function note(
  ac: AudioContext,
  opts: {
    freq: number;
    start: number;
    dur: number;
    type?: OscillatorType;
    peak?: number;
    freqEnd?: number;
  },
) {
  const { freq, start, dur, type = "sine", peak = 0.08, freqEnd } = opts;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), start + dur);
  }
  osc.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0008, start + dur);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Play the given notification sound. Silent no-op if audio is unavailable. */
export function playNotificationSound(id: NotificationSoundId): void {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime;
  try {
    switch (id) {
      case "ping":
        note(ac, { freq: 880, start: t, dur: 0.3, peak: 0.08 });
        break;
      case "bell":
        // Fundamental + inharmonic partial → bell timbre.
        note(ac, { freq: 660, start: t, dur: 0.9, peak: 0.07 });
        note(ac, { freq: 990, start: t, dur: 0.7, peak: 0.035 });
        note(ac, { freq: 1980, start: t, dur: 0.4, peak: 0.015 });
        break;
      case "chime":
        // Major triad arpeggio C5–E5–G5.
        note(ac, { freq: 523.25, start: t, dur: 0.35, peak: 0.06 });
        note(ac, { freq: 659.25, start: t + 0.09, dur: 0.35, peak: 0.06 });
        note(ac, { freq: 783.99, start: t + 0.18, dur: 0.45, peak: 0.06 });
        break;
      case "coins":
        // Quick bright ascending blips → "cha-ching".
        note(ac, { freq: 1320, start: t, dur: 0.08, type: "square", peak: 0.04 });
        note(ac, { freq: 1760, start: t + 0.06, dur: 0.08, type: "square", peak: 0.04 });
        note(ac, { freq: 2200, start: t + 0.12, dur: 0.12, type: "square", peak: 0.04 });
        break;
      case "pop":
        note(ac, { freq: 720, start: t, dur: 0.09, type: "triangle", peak: 0.1, freqEnd: 420 });
        break;
      case "blip":
        note(ac, { freq: 1000, start: t, dur: 0.06, type: "square", peak: 0.05 });
        break;
      case "boom":
        note(ac, { freq: 150, start: t, dur: 0.5, type: "sine", peak: 0.18, freqEnd: 60 });
        break;
      case "drop":
        // Descending swoop.
        note(ac, { freq: 900, start: t, dur: 0.28, type: "sine", peak: 0.09, freqEnd: 200 });
        break;
      default:
        note(ac, { freq: 880, start: t, dur: 0.3, peak: 0.08 });
    }
  } catch {
    /* silent */
  }
}

/** Read the user's chosen sound from localStorage (falls back to default). */
export function getSelectedNotificationSound(): NotificationSoundId {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SOUND;
  try {
    const v = localStorage.getItem(
      NOTIFICATION_SOUND_STORAGE_KEY,
    ) as NotificationSoundId | null;
    if (v && NOTIFICATION_SOUNDS.some((s) => s.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_NOTIFICATION_SOUND;
}
