/**
 * Size and complexity limits shared by site/, frontend/, frontend-admin/ and packages/* (docs/ARCHITECTURE-CHECKS.md).
 * Errors for every file; there is no exceptions list — split the code instead.
 */
export const LIMITS = {
  complexity: ["error", 15],
  "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
  "max-depth": ["error", 4],
};

/**
 * @param {string[]} dataFiles globs of plain data (translation dictionaries) where file length is not complexity
 */
export function architectureLimits(dataFiles = []) {
  const configs = [{ rules: LIMITS }];
  if (dataFiles.length > 0) {
    configs.push({ files: dataFiles, rules: { "max-lines": "off" } });
  }
  return configs;
}
