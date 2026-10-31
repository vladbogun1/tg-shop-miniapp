/** Longer than the limit (support thread); no limit → never too long. */
export function isTooLong(text: string, maxLength: number | undefined): boolean {
  return maxLength !== undefined && text.trim().length > maxLength;
}

/** The counter shows from 80 % of the limit. */
export function showCounter(text: string, maxLength: number | undefined): boolean {
  return maxLength !== undefined && text.length > maxLength * 0.8;
}

/**
 * Send button state: nothing to send (unless a photo is uploading and the chat lets you send meanwhile),
 * a send in flight, or over the limit.
 */
export function isSendDisabled(opts: {
  text: string;
  sending: boolean;
  uploading: boolean;
  sendWhileUploading: boolean;
  tooLong: boolean;
}): boolean {
  const nothing = !opts.text.trim() && !(opts.sendWhileUploading && opts.uploading);
  return nothing || opts.sending || opts.tooLong;
}
