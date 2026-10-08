import "./lost-404.css";

/**
 * 404: the mascot looks for the missing page with a magnifier (left, right), scratches his head,
 * finds an empty «404» box at his feet, shrugs with a grin and gives a thumbs-up. 6 hi-res frames
 * of 240×200 (shown at 180×150 / 216×180), one 7.2 s loop with the search beats held longer.
 * Reduced motion: holds the "found it" frame.
 */
export function Lost404() {
  return <span aria-hidden className="mx-lost" />;
}
