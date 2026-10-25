export function mfaIsRequired(globalOn: boolean, userRequired: number | null | undefined) {
  return globalOn || Number(userRequired) === 1;
}
