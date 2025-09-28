const DURATION_REGEX = /^(\d+)([smhd])$/;

const UNIT_IN_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400
};

export const parseDurationToSeconds = (duration: string): number => {
  const match = duration.match(DURATION_REGEX);
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  const unit = match[2];
  return value * UNIT_IN_SECONDS[unit];
};

export const parseDurationToMilliseconds = (duration: string): number => parseDurationToSeconds(duration) * 1000;
