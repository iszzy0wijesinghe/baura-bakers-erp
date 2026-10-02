export function getRouteParam(
  value: unknown,
  name = "Route parameter"
): string {
  if (
    typeof value ===
      "string" &&
    value.trim().length >
      0
  ) {
    return value.trim();
  }

  if (
    Array.isArray(
      value
    ) &&
    typeof value[0] ===
      "string" &&
    value[0]
      .trim()
      .length >
      0
  ) {
    return value[0].trim();
  }

  throw new Error(
    `${name} is required`
  );
}