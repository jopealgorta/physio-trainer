"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SOUND_KEY = "workout:sound";

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
    (kind: "end" | "finish") => {
      if (!soundOn) return;
      navigator.vibrate?.(kind === "finish" ? [200, 100, 200, 100, 300] : [200]);
      const audio = context.current;
      if (!audio || audio.state !== "running") return;
      const beeps = kind === "finish" ? [660, 880, 1100] : [880];
      beeps.forEach((frequency, index) => {
        const start = audio.currentTime + index * 0.2;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
      });
    },
    [soundOn],
  );

  return { soundOn, toggleSound, unlock, cue };
}
