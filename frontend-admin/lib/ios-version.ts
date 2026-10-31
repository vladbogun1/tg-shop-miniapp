/** iOS version from a User-Agent: `OS 16_4` -> [16, 4]; null when the UA has no iOS version. */
export type IosVersion = readonly [major: number, minor: number];

export function parseIosVersion(userAgent: string): IosVersion | null {
  const m = userAgent.match(/OS (\d+)[_.](\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** `v` is older than major.minor; compared as a tuple (16.10 is newer than 16.4). */
export function isIosBelow(v: IosVersion, major: number, minor: number): boolean {
  return v[0] < major || (v[0] === major && v[1] < minor);
}
