import { CheckIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

const PARTICLES = Array.from({ length: 20 }, (_, index) => {
  const angle = (index / 20) * Math.PI * 2 + (index % 2) * 0.15;
  const distance = [110, 160, 135][index % 3]!;
  return {
    dx: Math.round(Math.cos(angle) * distance),
    // The extra push down is the confetti falling as it fades.
    dy: Math.round(Math.sin(angle) * distance + 40),
    rot: (index % 2 === 0 ? 1 : -1) * (180 + index * 25),
    delay: (index % 4) * 40,
    tone: ["bg-primary", "bg-primary/60", "bg-foreground/70", "bg-primary/80"][index % 4]!,
    round: index % 3 === 0,
  };
});

/** Pieces of confetti thrown out from the centre of the positioned parent. No motion, no show. */
export function Confetti() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center motion-reduce:hidden"
    >
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className={cn(
            "motion-safe:animate-workout-confetti absolute size-2.5 opacity-0",
            particle.tone,
            particle.round ? "rounded-full" : "rounded-[2px]",
          )}
          style={
            {
              "--dx": `${particle.dx}px`,
              "--dy": `${particle.dy}px`,
              "--rot": `${particle.rot}deg`,
              animationDelay: `${particle.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * Feedback for a finished set (spec 12): a check mark pops over the video with a ring pulse, and
 * the last set of an exercise adds confetti and a bigger check. Decorative only: the player's live
 * region announces the set. Under reduced motion the check just shows and fades.
 */
export function SetDoneBurst({ big }: { big: boolean }) {
  return (
    <div
      aria-hidden
      data-testid="set-done-burst"
      data-big={big}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[55%] items-center justify-center landscape:right-1/2 landscape:h-full"
    >
      <span
        className={cn(
          "bg-primary/40 motion-safe:animate-workout-ring absolute rounded-full motion-reduce:hidden",
          big ? "size-32" : "size-24",
        )}
      />
      <span
        className={cn(
          "bg-primary text-primary-foreground motion-safe:animate-workout-pop motion-reduce:animate-workout-fade flex items-center justify-center rounded-full opacity-0 shadow-lg",
          big ? "size-32" : "size-24",
        )}
      >
        <CheckIcon className={big ? "size-16" : "size-12"} strokeWidth={3} />
      </span>
      {big ? <Confetti /> : null}
    </div>
  );
}
