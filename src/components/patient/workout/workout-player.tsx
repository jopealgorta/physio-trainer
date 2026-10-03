"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
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
  type ReactNode,
} from "react";

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
import { distanceDisplay } from "@/lib/distance";
import { durationDisplay } from "@/lib/prescription";
import { useMediaQuery } from "@/lib/use-media-query";
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

import { ExerciseList, type ExerciseLogging } from "../exercise-list";
import { ExerciseLogButton } from "../exercise-log-button";
import { Confetti, SetDoneBurst } from "./set-done-burst";

const TICK_MS = 250;
const ADD_SECONDS = 15;
const SWIPE_DISTANCE = 60;
/** How long the set-done effects stay mounted (the animations are a little shorter). */
const BURST_MS = 900;
const BIG_BURST_MS = 1600;

type Notice = { text: string; /** Shown on screen too, not only announced. */ visible: boolean };
type Celebration = { id: number; big: boolean };

type Translate = ReturnType<typeof useTranslations<"Workout">>;

/**
 * Full-screen guided workout (spec 12, laid out by spec 19): the routine's exercise list with the
 * current exercise highlighted, and a bottom bar with the set's target, optional hold and timed
 * countdowns, the rest between sets and the controls. Videos open from the list. Everything lives
 * in the browser; the state machine is `@/lib/workout/machine` and timers are timestamps, so a tab
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
  /** Shown on the "Well done" screen: where the patient logs the session (spec 13). */
  finishSlot?: ReactNode;
  /** Today's exercise logs for this routine (and entry), for the list and the bar's Log button. */
  exerciseLogging?: ExerciseLogging;
};

function Player({
  routine,
  code,
  today,
  exitHref,
  label,
  finishSlot,
  exerciseLogging,
}: PlayerProps) {
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
  const seconds = countdownSeconds(remainingMs(state, now));
  const inProgress = state.stepIndex > 0 || state.phase !== "ready";

  // The list ticks the sets already behind the patient, per exercise.
  const doneSets = useMemo(() => {
    const done: Record<string, number> = {};
    for (const behind of steps.slice(0, state.stepIndex)) {
      done[behind.itemId] = (done[behind.itemId] ?? 0) + 1;
    }
    return done;
  }, [steps, state.stepIndex]);

  // Keep the current exercise's row in view as the workout moves on (not on every set).
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const currentRow = useRef<HTMLLIElement | null>(null);
  const currentRef = useCallback((element: HTMLLIElement | null) => {
    currentRow.current = element;
  }, []);
  useEffect(() => {
    currentRow.current?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [step.exerciseIndex, reducedMotion]);

  const exit = () => {
    clearWorkoutState(window.sessionStorage, storageKey);
    router.push(exitHref as Route);
  };

  // Horizontal swipes move between steps; vertical gestures stay with scrolling.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  // React events bubble out of portals: a drag inside the log sheet opened from the bar reaches
  // the bar's handlers too. Only gestures on the bar's own DOM count.
  const onBar = (event: PointerEvent) => event.currentTarget.contains(event.target as Node);
  const onPointerDown = (event: PointerEvent) => {
    unlock();
    swipeStart.current =
      event.pointerType === "mouse" || !onBar(event)
        ? null
        : { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !onBar(event)) return;
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
          {finishSlot}
          <Button
            size="lg"
            variant={finishSlot ? "outline" : "default"}
            className="h-14 px-8 text-base"
            onClick={exit}
          >
            {t("finished.back")}
          </Button>
        </div>
      </Shell>
    );
  }

  const progress = (state.stepIndex / steps.length) * 100;
  const target = setTargets(set, t);
  const canLog = exerciseLogging !== undefined && exerciseLogging.days.length > 0;
  const timed = step.durationSeconds !== null;
  const counting = state.phase === "rest" || state.phase === "timed";
  const onSkip = () => act((current, at) => skipTimer(steps, current, at), state.phase === "timed");
  const onAdd = () => act((current) => adjust(current, ADD_SECONDS * 1000));

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
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{routine.name}</h1>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <ExerciseList
            blocks={routine.blocks}
            currentItemId={step.itemId}
            doneSets={doneSets}
            currentRef={currentRef}
            logging={exerciseLogging}
          />
        </div>
      </div>

      {/* The bottom bar: horizontal swipes here move between steps. */}
      <section
        aria-label={t("current")}
        className="bg-background relative touch-pan-y border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeStart.current = null)}
      >
        {celebration ? <SetDoneBurst key={celebration.id} big={celebration.big} /> : null}
        <div className="mx-auto grid w-full max-w-2xl gap-3">
          <div className="grid min-w-0 gap-1.5">
            <p className="text-muted-foreground text-xs font-medium">
              <span
                key={step.exerciseIndex}
                className="motion-safe:animate-workout-bump inline-block origin-left"
              >
                {t("progress", { current: step.exerciseIndex + 1, total: exerciseCount })}
              </span>
              <span aria-hidden> · </span>
              <span
                key={state.stepIndex}
                className="motion-safe:animate-workout-bump inline-block origin-left"
              >
                {t("setOf", { current: step.setIndex + 1, total: step.setCount })}
              </span>
            </p>
            <div className="flex min-w-0 items-baseline gap-2">
              {state.phase === "rest" ? (
                <p className="text-muted-foreground shrink-0 text-sm font-medium">{t("upNext")}</p>
              ) : null}
              <p className="min-w-0 truncate text-lg font-semibold">{item.name}</p>
            </div>
            {step.side || target.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5 text-sm font-medium">
                {step.side ? <Chip primary>{t(`side.${step.side}`)}</Chip> : null}
                {target.map((value) => (
                  <Chip key={value}>{value}</Chip>
                ))}
              </ul>
            ) : null}
            <p role="status" className={cn("text-sm font-medium", !notice?.visible && "sr-only")}>
              {notice?.text}
            </p>
          </div>

          {state.endsAt !== null ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-sm">
                  {state.phase === "rest"
                    ? t("rest")
                    : state.phase === "hold"
                      ? t("hold")
                      : t("timeLeft")}
                </p>
                <p className="text-4xl font-semibold tabular-nums" role="timer">
                  {formatCountdown(seconds)}
                </p>
              </div>
              <Button variant="outline" className="h-12 shrink-0 text-base" onClick={onAdd}>
                <span aria-hidden>{t("addTime")}</span>
                <span className="sr-only">{t("addTimeLabel")}</span>
              </Button>
              {/* A hold runs inside the set: its Skip sits here, Set done stays the main action. */}
              {state.phase === "hold" ? (
                <Button variant="outline" className="h-12 shrink-0 text-base" onClick={onSkip}>
                  {t("skip")}
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              aria-label={t("previous")}
              disabled={state.stepIndex === 0 && state.phase === "ready"}
              onClick={() => act((current) => goTo(steps, current, current.stepIndex - 1))}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            {/* Long labels (Spanish "Iniciar cuenta regresiva") wrap inside the button. */}
            <Button
              className="h-12 min-w-0 flex-1 text-base leading-tight whitespace-normal"
              onClick={
                counting
                  ? onSkip
                  : timed
                    ? () => act((current, at) => startTimed(steps, current, at))
                    : () => act((current, at) => completeSet(steps, current, at), true)
              }
            >
              {counting ? t("skip") : timed ? t("startTimer") : t("setDone")}
            </Button>
            {state.phase === "ready" && step.holdSeconds !== null && !timed ? (
              <Button
                variant="outline"
                className="h-12 shrink-0 text-base"
                onClick={() => act((current, at) => startHold(steps, current, at))}
              >
                {t("startHold", { value: step.holdSeconds })}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              className="size-12 shrink-0"
              aria-label={t("next")}
              onClick={() => act((current) => nextStep(steps, current))}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>

          {canLog ? (
            <ExerciseLogButton
              // A fresh sheet for each exercise.
              key={item.id}
              variant="bar"
              logging={exerciseLogging}
              exerciseId={item.exerciseId}
              exerciseName={item.name}
            />
          ) : null}
        </div>
      </section>

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
        "rounded-md px-2 py-0.5",
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
  if (set.durationSeconds !== null) {
    const duration = durationDisplay(set.durationSeconds);
    labels.push(
      duration.unit === "minutesSeconds"
        ? t("target.minutesSeconds", { minutes: duration.minutes, seconds: duration.seconds })
        : duration.unit === "minutes"
          ? t("target.minutes", { value: duration.value })
          : t("target.duration", { value: duration.value }),
    );
  }
  if (set.distanceMeters !== null) {
    const distance = distanceDisplay(set.distanceMeters);
    labels.push(
      t(distance.unit === "km" ? "target.distanceKm" : "target.distanceM", {
        value: distance.value,
      }),
    );
  }
  if (set.load) labels.push(t("target.load", { value: set.load }));
  if (set.intensity) labels.push(t("target.intensity", { value: set.intensity }));
  return labels;
}
