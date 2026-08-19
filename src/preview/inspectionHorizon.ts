export const DEFAULT_INSPECTION_HORIZON_SECONDS = 10;

export type InspectionHorizonSource =
  "css-finite" | "css-iteration" | "smil-finite" | "smil-iteration" | "default";

export interface InspectionHorizon {
  readonly seconds: number;
  readonly source: InspectionHorizonSource;
  readonly unresolvedTimings: number;
  readonly fallback: "static" | "unresolved" | "zero-length" | null;
}

export interface HorizonCandidate {
  readonly seconds: number;
  readonly source: Exclude<InspectionHorizonSource, "default">;
}

export interface WebAnimationTiming {
  readonly delay: unknown;
  readonly duration: unknown;
  readonly endTime: unknown;
}

export interface SmilTiming {
  readonly begin: string | null;
  readonly dur: string | null;
  readonly repeatCount: string | null;
  readonly repeatDur: string | null;
}

const CLOCK_NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`;
const TIMECOUNT = new RegExp(`^(${CLOCK_NUMBER})(h|min|s|ms)?$`, "i");
const REPEAT_COUNT = new RegExp(`^${CLOCK_NUMBER}$`);
const PARTIAL_CLOCK = /^(\d+):([0-5]?\d(?:\.\d+)?)$/;
const FULL_CLOCK = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/;

export function parseSmilClockValue(value: string | null): number | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const full = FULL_CLOCK.exec(normalized);
  if (full) {
    return Number(full[1]) * 3600 + Number(full[2]) * 60 + Number(full[3]);
  }

  const partial = PARTIAL_CLOCK.exec(normalized);
  if (partial) return Number(partial[1]) * 60 + Number(partial[2]);

  const timecount = TIMECOUNT.exec(normalized);
  if (!timecount) return null;
  const amount = Number(timecount[1]);
  const unit = timecount[2]?.toLowerCase() ?? "s";
  if (unit === "h") return amount * 3600;
  if (unit === "min") return amount * 60;
  if (unit === "ms") return amount / 1000;
  return amount;
}

export function parseSmilBegin(value: string | null): number | null {
  if (value === null || !value.trim()) return 0;
  const offsets = value.split(";").map((part) => {
    const normalized = part.trim();
    const sign = normalized.startsWith("-") ? -1 : 1;
    const unsigned = /^[+-]/.test(normalized)
      ? normalized.slice(1)
      : normalized;
    const seconds = parseSmilClockValue(unsigned);
    return seconds === null ? null : Math.max(0, sign * seconds);
  });
  if (offsets.some((offset) => offset === null)) return null;
  return Math.max(...(offsets as number[]));
}

export function webAnimationCandidate(
  timing: WebAnimationTiming,
): HorizonCandidate | null {
  if (typeof timing.endTime === "number" && Number.isFinite(timing.endTime)) {
    return {
      seconds: Math.max(0, timing.endTime) / 1000,
      source: "css-finite",
    };
  }
  if (
    timing.endTime === Number.POSITIVE_INFINITY &&
    typeof timing.duration === "number" &&
    Number.isFinite(timing.duration) &&
    typeof timing.delay === "number"
  ) {
    return {
      seconds: (Math.max(0, timing.delay) + timing.duration) / 1000,
      source: "css-iteration",
    };
  }
  return null;
}

function repeatCount(value: string): number | null {
  const normalized = value.trim();
  if (normalized.toLowerCase() === "indefinite") return Infinity;
  if (!REPEAT_COUNT.test(normalized)) return null;
  return Number(normalized);
}

function repeatDuration(value: string): number | null {
  if (value.trim().toLowerCase() === "indefinite") return Infinity;
  return parseSmilClockValue(value);
}

export function smilCandidate(timing: SmilTiming): HorizonCandidate | null {
  const begin = parseSmilBegin(timing.begin);
  const duration = parseSmilClockValue(timing.dur);
  const authoredRepeatCount = timing.repeatCount?.trim() ?? "";
  const authoredRepeatDuration = timing.repeatDur?.trim() ?? "";
  const hasRepeatCount = Boolean(authoredRepeatCount);
  const hasRepeatDuration = Boolean(authoredRepeatDuration);
  const repeats = hasRepeatCount
    ? repeatCount(authoredRepeatCount)
    : hasRepeatDuration
      ? Infinity
      : 1;
  const repeatDur = hasRepeatDuration
    ? repeatDuration(authoredRepeatDuration)
    : Infinity;
  if (
    begin === null ||
    duration === null ||
    repeats === null ||
    repeatDur === null
  ) {
    return null;
  }

  const repeatedDuration = Number.isFinite(repeats)
    ? repeats * duration
    : Infinity;
  const activeDuration = Math.min(repeatedDuration, repeatDur);
  const repeatsIndefinitely = !Number.isFinite(activeDuration);
  const seconds = begin + (repeatsIndefinitely ? duration : activeDuration);

  return {
    seconds: Math.max(0, seconds),
    source: repeatsIndefinitely ? "smil-iteration" : "smil-finite",
  };
}

export function resolveInspectionHorizon(
  candidates: readonly HorizonCandidate[],
  unresolvedTimings: number,
): InspectionHorizon {
  let winner: HorizonCandidate | undefined;
  let zeroLengthTimings = 0;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.seconds) || candidate.seconds <= 0) {
      if (candidate.seconds === 0) zeroLengthTimings += 1;
      continue;
    }
    if (!winner || candidate.seconds > winner.seconds) winner = candidate;
  }
  if (!winner) {
    return {
      seconds: DEFAULT_INSPECTION_HORIZON_SECONDS,
      source: "default",
      unresolvedTimings,
      fallback:
        unresolvedTimings > 0
          ? "unresolved"
          : zeroLengthTimings > 0
            ? "zero-length"
            : "static",
    };
  }
  return {
    ...winner,
    seconds: Math.ceil(winner.seconds * 1000) / 1000,
    unresolvedTimings,
    fallback: null,
  };
}

export function inspectionHorizonLabel(horizon: InspectionHorizon): string {
  const seconds =
    horizon.source === "default"
      ? `${horizon.seconds}s`
      : `${horizon.seconds.toFixed(2)}s`;
  const provenance =
    horizon.source === "css-finite"
      ? "longest CSS animation"
      : horizon.source === "css-iteration"
        ? "longest CSS iteration"
        : horizon.source === "smil-finite"
          ? "longest SMIL timing"
          : horizon.source === "smil-iteration"
            ? "longest SMIL iteration"
            : horizon.fallback === "unresolved"
              ? "indefinite or event-driven timing"
              : horizon.fallback === "zero-length"
                ? "zero-length animation timing"
                : "no animation timing";
  const unresolved =
    horizon.source !== "default" && horizon.unresolvedTimings
      ? ` · ${horizon.unresolvedTimings} timing${horizon.unresolvedTimings === 1 ? "" : "s"} unresolved`
      : "";
  return `horizon ${seconds} · ${provenance}${unresolved}`;
}
