const STATUS_FIELD_CANDIDATES = ["状态", "血量", "生命值", "status", "Status"];

const LAST_STAND_GROUP_STAGE_MAP: Record<string, string> = {
  "一站到底(初中组)": "3",
  "一站到底(中职组)": "2",
  "一站到底(高中组)": "1",
  "一站到底（初中组）": "3",
  "一站到底（中职组）": "2",
  "一站到底（高中组）": "1",
};

const LAST_STAND_GROUP_LABEL_MAP: Record<string, string> = {
  初中组: "3",
  中职组: "2",
  高中组: "1",
};

const LAST_STAND_GROUP_STAGE_REGEX = /^一站到底\s*[\(（](.*?)[\)）]\s*$/u;

export function resolveStatusFieldKey(
  fields?: Record<string, unknown>
): string | undefined {
  if (fields) {
    for (const key of STATUS_FIELD_CANDIDATES) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        return key;
      }
    }
  }

  return STATUS_FIELD_CANDIDATES[0];
}

export function resolveLastStandGroupStatusIndicator(
  stageName?: string | null
): string | undefined {
  if (!stageName) return undefined;
  const trimmed = stageName.trim();
  if (!trimmed) return undefined;

  const direct = LAST_STAND_GROUP_STAGE_MAP[trimmed];
  if (direct) return direct;

  const match = LAST_STAND_GROUP_STAGE_REGEX.exec(trimmed);
  if (!match) return undefined;
  const label = match[1]?.replace(/\s+/g, "");
  if (!label) return undefined;

  const directLabel = LAST_STAND_GROUP_LABEL_MAP[label];
  if (directLabel) return directLabel;

  const normalizedLabel = label.endsWith("组") ? label : `${label}组`;
  return LAST_STAND_GROUP_LABEL_MAP[normalizedLabel];
}
