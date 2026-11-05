export function isExplicitAdminResult(data) {
  const value = Array.isArray(data) ? data[0] : data;
  return value === true
    || value === "true"
    || value?.v3_self_is_admin === true
    || value?.v3_self_is_admin === "true";
}
