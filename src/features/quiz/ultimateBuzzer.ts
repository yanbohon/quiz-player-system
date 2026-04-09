import {
  getOceanGroupLabel,
  isOceanGroupId,
  type OceanGroupId,
} from "./oceanGroup";
import { isUltimateBuzzMode } from "./modes";
import type { ContestModeId } from "./types";

interface ResolveBuzzerIdentityParams {
  modeId: ContestModeId;
  userId?: string | null;
  sprintTeamId?: OceanGroupId | null;
}

interface ResolveBuzzerWinnerParams extends ResolveBuzzerIdentityParams {
  winnerId?: string | null;
}

export function resolveUltimateBuzzerIdentity({
  modeId,
  userId,
  sprintTeamId,
}: ResolveBuzzerIdentityParams): string | null {
  if (!isUltimateBuzzMode(modeId)) {
    return null;
  }
  if (modeId === "buzzer-sprint") {
    return sprintTeamId ?? null;
  }
  const normalizedUserId = userId?.trim();
  return normalizedUserId ? normalizedUserId : null;
}

export function isUltimateBuzzerWinnerSelf({
  modeId,
  winnerId,
  userId,
  sprintTeamId,
}: ResolveBuzzerWinnerParams): boolean {
  if (!isUltimateBuzzMode(modeId)) {
    return false;
  }

  const normalizedWinnerId = winnerId?.trim();
  if (!normalizedWinnerId) {
    return false;
  }

  const normalizedUserId = userId?.trim();
  if (normalizedUserId && normalizedWinnerId === normalizedUserId) {
    return true;
  }

  return modeId === "buzzer-sprint" && sprintTeamId === normalizedWinnerId;
}

export function resolveUltimateBuzzerWinnerLabel(
  winnerId?: string | null,
  profileDisplayName?: string | null
): string {
  const normalizedWinnerId = winnerId?.trim();
  if (!normalizedWinnerId) {
    return "对方队伍";
  }

  const teamLabel = isOceanGroupId(normalizedWinnerId)
    ? getOceanGroupLabel(normalizedWinnerId)
    : null;
  if (teamLabel) {
    return teamLabel;
  }

  const normalizedProfileName = profileDisplayName?.trim();
  if (normalizedProfileName) {
    return normalizedProfileName;
  }

  return `台号${normalizedWinnerId}`;
}
