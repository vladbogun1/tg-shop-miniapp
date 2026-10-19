/**
 * @shop/shared/case-ui — the gift case UI (React + framer-motion), shared by the Mini App and the
 * website. A separate entry so the admin app (and anything importing "@shop/shared") does not pull
 * React components it never renders.
 */
export * from "./GiftCaseOpening";
export * from "./GiftCaseParts";
export { unlockCaseAudio, isCaseAudioMuted, setCaseAudioMuted } from "./case-audio";
export * from "./case-tier";
export * from "./case-size";
