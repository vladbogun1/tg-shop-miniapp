/**
 * @shop/shared — everything the customer Mini App, the website and the admin panel share
 * (incl. the ChiSetup logo geometry in ./brand, the i18n core of the Mini App and the website, the
 * phone mask and the common motion presets).
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
export * from "./i18n";
export * from "./image";
export * from "./money";
export * from "./motion";
export * from "./np-geo";
export * from "./site";
export * from "./tap";
export * from "./orders";
export * from "./phone";
export * from "./product-brand";
export * from "./receipts";
export * from "./telegram-html";
export * from "./bonuses";
export * from "./support";
export * from "./types";
export * from "./ws";
