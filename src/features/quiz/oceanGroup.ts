export const OCEAN_GROUP_IDS = ["red", "blue"] as const;

export type OceanGroupId = (typeof OCEAN_GROUP_IDS)[number];
export type OceanPlayMode = "solo" | "group";

export function isOceanGroupId(value: unknown): value is OceanGroupId {
  return value === "red" || value === "blue";
}

export function isOceanPlayMode(value: unknown): value is OceanPlayMode {
  return value === "solo" || value === "group";
}

export function normalizeOceanPlayMode(value: unknown): OceanPlayMode | null {
  if (value === "solo" || value === "个人" || value === "个人模式") {
    return "solo";
  }
  if (value === "group" || value === "团队" || value === "团队模式") {
    return "group";
  }
  return null;
}

export function getOceanPlayModeLabel(mode: OceanPlayMode | null | undefined): string | null {
  if (mode === "solo") {
    return "个人模式";
  }
  if (mode === "group") {
    return "团队模式";
  }
  return null;
}

export function getOceanGroupLabel(groupId: OceanGroupId | null | undefined): string | null {
  if (groupId === "red") {
    return "红队";
  }
  if (groupId === "blue") {
    return "蓝队";
  }
  return null;
}
