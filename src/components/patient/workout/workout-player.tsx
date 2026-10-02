"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DumbbellIcon,
  PartyPopperIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";

import { YouTubePreview } from "@/components/library/youtube-preview";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCues } from "@/lib/workout/cues";
import { countdownSeconds, formatCountdown } from "@/lib/workout/format";
import {
  adjust,
  buildSteps,
  completeSet,
  goTo,
  initialState,
  isLastSetOfExercise,
  nextStep,
  remainingMs,
  skipTimer,
  startHold,
  startTimed,
  tick,
  type WorkoutState,
} from "@/lib/workout/machine";
import {
  clearWorkoutState,
  loadWorkoutState,
  saveWorkoutState,
  workoutStorageKey,
} from "@/lib/workout/storage";
import { useWakeLock } from "@/lib/workout/use-wake-lock";
import type { PatientItem, PatientRoutine } from "@/server/patient/view";

import { Confetti, SetDoneBurst } from "./set-done-burst";

const TICK_MS = 250;
const ADD_SECONDS = 15;
const SWIPE_DISTANCE = 60;
/** How long the set-done effects stay mounted (the animations are a little shorter). */
const BURST_MS = 900;
const BIG_BURST_MS = 1600;

/**
 * Wide (16:9) videos on a portrait phone are as tall as the screen is wide, so they are scaled to
 * cover this window instead, trimming a little off the sides. Shorts (9:16) fill the stage.
 */
const WIDE_VIDEO_WINDOW = "aspect-[4/3]";

type Notice = { text: string; /** Shown on screen too, not only announced. */ visible: boolean };
type Celebration = { id: number; big: boolean };

type Translate = ReturnType<typeof useTranslations<"Workout">>;

/**
 * Full-screen guided workout (spec 12): one set at a time with the exercise's looping video, the
 * set's target, optional hold and timed countdowns and a rest between sets. Everything lives in
 * the browser; the state machine is `@/lib/workout/machine` and timers are timestamps, so a tab
 * that was hidden catches up on return. Reps are not counted: the patient taps "Set done".
 */
export function WorkoutPlayer(props: PlayerProps) {
  // Progress lives in sessionStorage, which the server cannot see: mount the player on the client
  // only, with its saved state read once up front (no flash of step 1, no state set in an effect).
  const onClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return onClient ? <Player {...props} /> : <Shell label={props.label} />;
}

type PlayerProps = {
  routine: PatientRoutine;
  code: string;
  /** The physio's calendar day, part of the storage key so tomorrow starts fresh. */
  today: string;
  exitHref: string;
  /** Accessible name of the full-screen region (it names the routine). */
  label: string;
};

function Player({ routine, code, today, exitHref, label }: PlayerProps) {
  const t = useTranslations("Workout");
  const router = useRouter();
  const { soundOn, toggleSound, unlock, cue } = useCues();

  const steps = useMemo(() => buildSteps(routine.blocks), [routine.blocks]);
  const items = useMemo(() => {
    const byId = new Map<string, PatientItem>();
    for (const block of routine.blocks) {
      for (const item of block.kind === "single" ? [block.item] : block.items) {
        byId.set(item.id, item);
      }
    }
    return byId;
  }, [routine.blocks]);
  const exerciseCount = items.size;
  const storageKey = workoutStorageKey(code, routine.id, today);

  const [state, setState] = useState<WorkoutState>(() => {
    const saved = loadWorkoutState(window.sessionStorage, storageKey, steps.length);
    return saved ? tick(steps, saved, Date.now()) : initialState();
  });
  const stateRef = useRef(state);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<Notice | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrations = useRef(0);
  const [confirmExit, setConfirmExit] = useState(false);

  const commit = useCallback((next: WorkoutState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    if (state.phase === "finished") clearWorkoutState(window.sessionStorage, storageKey);
    else saveWorkoutState(window.sessionStorage, storageKey, state);
  }, [state, storageKey]);

  useWakeLock(state.phase !== "finished");

  useEffect(() => {
    if (!celebration) return;
    const id = window.setTimeout(
      () => setCelebration(null),
      celebration.big ? BIG_BURST_MS : BURST_MS,
    );
    return () => window.clearTimeout(id);
  }, [celebration]);

  /** Effects for a finished set; `withCue` is false when a countdown's own beep already played. */
  const celebrate = useCallback(
    (stepIndex: number, withCue: boolean) => {
      const big = isLastSetOfExercise(steps, stepIndex);
      celebrations.current += 1;
      setCelebration({ id: celebrations.current, big });
      const done = steps[stepIndex]!;
      const name = items.get(done.itemId)?.name ?? "";
      if (withCue) {
        setNotice({
          text: big
            ? t("announce.exerciseDone", { name })
            : t("announce.setDone", { current: done.setIndex + 1, total: done.setCount }),
          visible: false,
        });
        cue(big ? "exercise" : "set");
      }
    },
    [steps, items, cue, t],
  );

  // Countdowns: applied from timestamps on a short interval and whenever the tab comes back.
  const running = state.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    const update = () => {
      const at = Date.now();
      setNow(at);
      const previous = stateRef.current;
      const next = tick(steps, previous, at);
      if (next === previous) return;
      commit(next);
      announce(previous, next);
    };
    const announce = (previous: WorkoutState, next: WorkoutState) => {
      if (next.phase === "finished") {
        setNotice({ text: t("announce.finished"), visible: true });
        cue("finish");
      } else if (previous.phase === "rest") {
        const name = items.get(steps[next.stepIndex]!.itemId)?.name ?? "";
        setNotice({ text: t("announce.restOver", { name }), visible: true });
        cue("end");
      } else {
        setNotice({
          text: previous.phase === "hold" ? t("announce.holdDone") : t("announce.timeUp"),
          visible: true,
        });
        cue("end");
        // A timed set that ran out is a finished set: the beep stands in for the chime.
        if (previous.phase === "timed") celebrate(previous.stepIndex, false);
      }
    };
    update();
    const id = window.setInterval(update, TICK_MS);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, [running, steps, items, commit, cue, celebrate, t]);

  /**
   * Runs a user action: unlocks audio, clears the last notice and applies the new state.
   * `finishesSet` marks actions that complete the current set (so it gets the celebration).
   */
  const act = (
    change: (current: WorkoutState, at: number) => WorkoutState,
    finishesSet = false,
  ) => {
    unlock();
    setNotice(null);
    const at = Date.now();
    setNow(at);
    const previous = stateRef.current;
    const next = change(previous, at);
    commit(next);
    if (next.phase === "finished" && previous.phase !== "finished") {
      setNotice({ text: t("announce.finished"), visible: true });
      cue("finish");
    } else if (finishesSet && next !== previous) {
      celebrate(previous.stepIndex, true);
    }
  };

  const step = steps[Math.min(state.stepIndex, steps.length - 1)]!;
  const item = items.get(step.itemId)!;
  const set = item.sets[step.setIndex] ?? item.sets[0];
  const inGroup = routine.blocks.some(
    (block) => block.kind === "group" && block.items.some((member) => member.id === item.id),
  );
  const media = item.media[0];
  const seconds = countdownSeconds(remainingMs(state, now));
  const inProgress = state.stepIndex > 0 || state.phase !== "ready";

  const exit = () => {
    clearWorkoutState(window.sessionStorage, storageKey);
    router.push(exitHref as Route);
  };

  // Horizontal swipes move between steps; vertical gestures stay with scrolling.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent) => {
    unlock();
    swipeStart.current =
      event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    act((current) =>
      dx < 0 ? nextStep(steps, current) : goTo(steps, current, current.stepIndex - 1),
    );
  };

  if (state.phase === "finished") {
    return (
      <Shell label={label}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="relative">
            <PartyPopperIcon
              aria-hidden
              className="text-primary motion-safe:animate-workout-bump size-16"
            />
            <Confetti />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("finished.title")}</h1>
          <p className="text-muted-foreground wrap-anywhere">
            {t("finished.description", { name: routine.name })}
          </p>
          <p className="sr-only" role="status">
            {notice?.text}
          </p>
          <Button size="lg" className="h-14 px-8 text-base" onClick={exit}>
            {t("finished.back")}
          </Button>
        </div>
      </Shell>
    );
  }

  const progress = (state.stepIndex / steps.length) * 100;
  const target = setTargets(set, t);

  return (
    <Shell label={label} onPointerDown={unlock}>
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label={t("exit")}
          onClick={() => (inProgress ? setConfirmExit(true) : exit())}
        >
          <XIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label={t("previous")}
          disabled={state.stepIndex === 0 && state.phase === "ready"}
          onClick={() => act((current) => goTo(steps, current, current.stepIndex - 1))}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <p
          key={step.exerciseIndex}
          className="motion-safe:animate-workout-bump min-w-0 flex-1 truncate text-center text-sm font-medium"
        >
          {t("progress", { current: step.exerciseIndex + 1, total: exerciseCount })}
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label={t("next")}
          onClick={() => act((current) => nextStep(steps, current))}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-12"
          aria-label={soundOn ? t("sound.on") : t("sound.off")}
          aria-pressed={soundOn}
          onClick={() => {
            unlock();
            toggleSound();
          }}
        >
          {soundOn ? <Volume2Icon aria-hidden /> : <VolumeXIcon aria-hidden />}
        </Button>
      </header>
      <div className="bg-muted relative z-10 h-1.5" aria-hidden>
        <div
          className="bg-primary relative h-full motion-safe:transition-[width]"
          style={{ width: `${progress}%` }}
        >
          {celebration ? (
            <span
              key={celebration.id}
              className="bg-primary motion-safe:animate-workout-glow absolute -top-1 -right-3 h-3.5 w-8 rounded-full opacity-0 blur-sm motion-reduce:hidden"
            />
          ) : null}
        </div>
      </div>

      {/* Portrait: the video fills the stage and the details sit over its bottom edge. Landscape:
          video on the left half, details on the right. */}
      <div className="relative flex min-h-0 flex-1 flex-col landscape:flex-row">
        <div className="bg-muted absolute inset-0 flex justify-center landscape:static landscape:w-1/2 landscape:shrink-0 landscape:items-center">
          {media ? (
            media.isShort ? (
              <YouTubePreview
                key={media.videoId}
                videoId={media.videoId}
                isShort
                title={item.name}
                autoPlay
                className="h-full w-auto max-w-full rounded-none"
              />
            ) : (
              <div
                className={cn(
                  "relative w-full self-start overflow-hidden landscape:self-center",
                  WIDE_VIDEO_WINDOW,
                )}
              >
                <YouTubePreview
                  key={media.videoId}
                  videoId={media.videoId}
                  isShort={false}
                  title={item.name}
                  autoPlay
                  className="absolute top-0 left-1/2 h-full w-auto -translate-x-1/2 rounded-none"
                />
              </div>
            )
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-2 self-start pt-20 text-sm landscape:self-center landscape:pt-0">
              <DumbbellIcon aria-hidden className="size-10" />
              {t("noVideo")}
            </div>
          )}
        </div>

        {celebration ? <SetDoneBurst key={celebration.id} big={celebration.big} /> : null}

        <div className="from-background via-background/85 relative mt-auto flex max-h-[60%] min-h-0 flex-col bg-linear-to-t to-transparent pt-8 landscape:mt-0 landscape:max-h-none landscape:flex-1 landscape:border-l landscape:bg-none landscape:pt-0">
          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-4 py-2"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipeStart.current = null)}
          >
            <div className="grid gap-2">
              {state.phase === "rest" ? (
                <p className="text-muted-foreground text-sm font-medium">{t("upNext")}</p>
              ) : null}
              <div className="grid gap-0.5">
                {inGroup ? (
                  <p className="text-muted-foreground text-xs font-semibold uppercase">
                    {t("superset")}
                  </p>
                ) : null}
                <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{item.name}</h1>
                <p
                  key={state.stepIndex}
                  className="text-muted-foreground motion-safe:animate-workout-bump w-fit origin-left text-sm"
                >
                  {t("setOf", { current: step.setIndex + 1, total: step.setCount })}
                </p>
              </div>
              <ul className="flex flex-wrap gap-2 text-base font-medium">
                {step.side ? <Chip primary>{t(`side.${step.side}`)}</Chip> : null}
                {target.map((label) => (
                  <Chip key={label}>{label}</Chip>
                ))}
              </ul>
              {item.notes ? (
                <p className="line-clamp-2 text-sm wrap-anywhere landscape:line-clamp-none">
                  <span className="font-medium">{t("notes")}: </span>
                  {item.notes}
                </p>
              ) : null}
              {item.instructions ? (
                <details className="text-sm">
                  <summary className="focus-visible:ring-ring/50 cursor-pointer rounded-sm py-1 font-medium outline-none focus-visible:ring-[3px]">
                    {t("instructions")}
                  </summary>
                  <p className="text-muted-foreground mt-1 wrap-anywhere whitespace-pre-line">
                    {item.instructions}
                  </p>
                </details>
              ) : null}
            </div>
          </div>

          <footer className="grid gap-3 px-4 pt-2 pb-4 landscape:border-t landscape:pt-4">
            <p
              role="status"
              className={cn("text-center text-sm font-medium", !notice?.visible && "sr-only")}
            >
              {notice?.text}
            </p>
            {state.endsAt !== null ? (
              <div className="grid gap-1 text-center">
                <p className="text-muted-foreground text-sm">
                  {state.phase === "rest"
                    ? t("rest")
                    : state.phase === "hold"
                      ? t("hold")
                      : t("timeLeft")}
                </p>
                <p className="text-5xl font-semibold tabular-nums landscape:text-4xl" role="timer">
                  {formatCountdown(seconds)}
                </p>
              </div>
            ) : null}

            <Controls
              t={t}
              phase={state.phase}
              step={step}
              onSetDone={() => act((current, at) => completeSet(steps, current, at), true)}
              onStartTimer={() => act((current, at) => startTimed(steps, current, at))}
              onStartHold={() => act((current, at) => startHold(steps, current, at))}
              onSkip={() =>
                act((current, at) => skipTimer(steps, current, at), state.phase === "timed")
              }
              onAdd={() => act((current) => adjust(current, ADD_SECONDS * 1000))}
            />
          </footer>
        </div>
      </div>

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("exitDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("exitDialog.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("exitDialog.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={exit}>{t("exitDialog.leave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}

/** Covers the clinic header and footer of the patient layout. */
function Shell({
  label,
  children,
  onPointerDown,
}: {
  label: string;
  children?: React.ReactNode;
  onPointerDown?: () => void;
}) {
  return (
    <section
      aria-label={label}
      onPointerDown={onPointerDown}
      className="bg-background text-foreground fixed inset-0 z-50 flex flex-col"
    >
      {children}
    </section>
  );
}

function Chip({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <li
      className={cn(
        "rounded-md px-2.5 py-1",
        primary ? "bg-primary text-primary-foreground" : "bg-muted",
      )}
    >
      {children}
    </li>
  );
}

function setTargets(set: PatientItem["sets"][number] | undefined, t: Translate): string[] {
  if (!set) return [];
  const labels: string[] = [];
  if (set.reps !== null) {
    labels.push(
      set.repsMax !== null
        ? t("target.range", { min: set.reps, max: set.repsMax })
        : t("target.reps", { count: set.reps }),
    );
  }
  if (set.durationSeconds !== null)
    labels.push(t("target.duration", { value: set.durationSeconds }));
  if (set.load) labels.push(t("target.load", { value: set.load }));
  return labels;
}

function Controls({
  t,
  phase,
  step,
  onSetDone,
  onStartTimer,
  onStartHold,
  onSkip,
  onAdd,
}: {
  t: Translate;
  phase: WorkoutState["phase"];
  step: { durationSeconds: number | null; holdSeconds: number | null };
  onSetDone: () => void;
  onStartTimer: () => void;
  onStartHold: () => void;
  onSkip: () => void;
  onAdd: () => void;
}) {
  const big = "h-14 text-base";
  if (phase === "rest" || phase === "timed") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="outline" className={big} onClick={onAdd}>
          <span aria-hidden>{t("addTime")}</span>
          <span className="sr-only">{t("addTimeLabel")}</span>
        </Button>
        <Button size="lg" className={big} onClick={onSkip}>
          {t("skip")}
        </Button>
      </div>
    );
  }
  const timed = step.durationSeconds !== null;
  return (
    <div className="grid gap-3">
      <Button size="lg" className={big} onClick={timed ? onStartTimer : onSetDone}>
        {timed ? t("startTimer") : t("setDone")}
      </Button>
      {phase === "hold" ? (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="outline" className={big} onClick={onAdd}>
            <span aria-hidden>{t("addTime")}</span>
            <span className="sr-only">{t("addTimeLabel")}</span>
          </Button>
          <Button size="lg" variant="outline" className={big} onClick={onSkip}>
            {t("skip")}
          </Button>
        </div>
      ) : step.holdSeconds !== null && !timed ? (
        <Button size="lg" variant="outline" className={big} onClick={onStartHold}>
          {t("startHold", { value: step.holdSeconds })}
        </Button>
      ) : null}
    </div>
  );
}
