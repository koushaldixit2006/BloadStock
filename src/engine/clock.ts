export const DISPATCH_BUFFER_MINUTES = 15;
export const SAFETY_MARGIN_MINUTES = 30;

export function formatSimDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}

export function formatSimTimeOnly(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}

export function getMinutesBetween(earlierIso: string, laterIso: string): number {
  const diffMs = new Date(laterIso).getTime() - new Date(earlierIso).getTime();
  return Math.round(diffMs / 60000);
}

export function addMinutesToIso(baseIso: string, minutes: number): string {
  const d = new Date(baseIso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getExpiryCountdown(simTimeIso: string, expiresAtIso: string): {
  text: string;
  hoursRemaining: number;
  isExpired: boolean;
  urgencyLevel: 'expired' | 'critical' | 'warning' | 'normal';
} {
  const minutes = getMinutesBetween(simTimeIso, expiresAtIso);
  const hoursRemaining = minutes / 60;

  if (minutes <= 0) {
    return {
      text: 'EXPIRED',
      hoursRemaining: 0,
      isExpired: true,
      urgencyLevel: 'expired',
    };
  }

  let text: string;
  if (minutes < 60) {
    text = `${minutes}m`;
  } else if (minutes < 48 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    text = m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else {
    const days = Math.floor(minutes / (24 * 60));
    const h = Math.floor((minutes % (24 * 60)) / 60);
    text = h > 0 ? `${days}d ${h}h` : `${days}d`;
  }

  let urgencyLevel: 'expired' | 'critical' | 'warning' | 'normal' = 'normal';
  if (hoursRemaining <= 6) {
    urgencyLevel = 'critical';
  } else if (hoursRemaining <= 24) {
    urgencyLevel = 'warning';
  }

  return {
    text,
    hoursRemaining,
    isExpired: false,
    urgencyLevel,
  };
}
