"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "workout:sound";

export type CueKind = "end" | "finish" | "set" | "exercise";

/**
 * What each cue sounds like. `end` (a countdown ran out) is a single long beep; `set` and
 * `exercise` are quick rising notes so a finished set never sounds like "rest over".
 */
const CUES: Record<CueKind, { vibrate: number[]; tones: number[]; gap: number; length: number }> = {
  end: { vibrate: [200], tones: [880], gap: 0.2, length: 0.16 },
  finish: { vibrate: [200, 100, 200, 100, 300], tones: [660, 880, 1100], gap: 0.2, length: 0.16 },
  set: { vibrate: [40], tones: [660, 990], gap: 0.09, length: 0.1 },
  exercise: {
    vibrate: [60, 50, 60, 50, 120],
    tones: [523, 659, 784, 1047],
    gap: 0.09,
    length: 0.12,
  },
};

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Beep and vibration at the end of a countdown (spec 12). The audio context is only created from
 * a user gesture (`unlock`, called by the Start tap and the controls), which is what iOS needs
 * before it plays anything. Every cue also has a text equivalent in the player's live region.
 */
export function useCues() {
  const context = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    try {
      // Restoring the saved preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(SOUND_KEY) === "off") setSoundOn(false);
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);

  const unlock = useCallback(() => {
    if (context.current === null) {
      const Context = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Context) return;
      context.current = new Context();
    }
    if (context.current.state === "suspended") void context.current.resume();
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      try {
        window.localStorage.setItem(SOUND_KEY, on ? "off" : "on");
      } catch {
        // Not remembered this time.
      }
      return !on;
    });
  }, []);

  const cue = useCallback(
    (kind: CueKind) => {
      if (!soundOn) return;
      const { vibrate, tones, gap, length } = CUES[kind];
      navigator.vibrate?.(vibrate);
      const audio = context.current;
      if (!audio || audio.state !== "running") return;
      tones.forEach((frequency, index) => {
        const start = audio.currentTime + index * gap;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + length + 0.02);
      });
    },
    [soundOn],
  );

  return { soundOn, toggleSound, unlock, cue };
}
