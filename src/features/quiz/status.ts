const STATUS_FIELD_CANDIDATES = ["状态", "血量", "生命值", "status", "Status"];

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
