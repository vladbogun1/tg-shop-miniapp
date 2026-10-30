/**
 * Size and complexity limits shared by site/, frontend/ and frontend-admin/ (docs/ARCHITECTURE-CHECKS.md).
 *
 * The limits are errors for every file. Files that already broke a limit when it was introduced
 * (2026-10-29) are listed per rule in each app's eslint.legacy-limits.mjs and only get a warning for
 * that rule: old debt stays visible, new debt fails `npm run lint`.
 */
export const LIMITS = {
  complexity: ["error", 15],
  "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
  "max-depth": ["error", 4],
};

/** Paths like app/[locale]/page.tsx are globs in flat config; brackets etc. must be escaped to match literally. */
const literal = (path) => path.replace(/[[\]()*?{}!+@]/g, (c) => `\\${c}`);

/**
 * @param {Partial<Record<keyof typeof LIMITS, string[]>>} legacy files allowed to break a rule (warn only)
 * @param {string[]} dataFiles globs of plain data (translation dictionaries) where file length is not complexity
 */
export function architectureLimits(legacy, dataFiles = []) {
  const configs = [{ rules: LIMITS }];
  for (const [rule, files] of Object.entries(legacy)) {
    if (files.length > 0) {
      const [, ...options] = LIMITS[rule];
      configs.push({ files: files.map(literal), rules: { [rule]: ["warn", ...options] } });
    }
  }
  if (dataFiles.length > 0) {
    configs.push({ files: dataFiles, rules: { "max-lines": "off" } });
  }
  return configs;
}
