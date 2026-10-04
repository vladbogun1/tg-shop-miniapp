/**
 * @shop/shared — everything the customer Mini App, the website and the admin panel share
 * (incl. the ChiSetup logo geometry in ./brand).
 *
 * Consumed as TypeScript source via Next's `transpilePackages`, so there is no build step and
 * no chance of the two apps running different compiled versions.
 */
export * from "./brand/logo";
export * from "./brand/preloader";
export * from "./cart";
export * from "./cn";
export * from "./format";
export * from "./http";
export * from "./image";
export * from "./money";
export * from "./site";
export * from "./orders";
export * from "./telegram-html";
export * from "./types";
export * from "./ws";
