import "server-only";
import { LOCALE_TAG, LOCALES, type Locale } from "@shop/core/i18n";
import { localePath, makeT } from "@/i18n";

import { BOT_URL, OWNER_TELEGRAM, SELLER, SITE_URL } from "@/lib/config";
import { SELLER_LOCALITY } from "@/lib/seller.data";
import { DEFAULT_OG_IMAGE, LOGO_URL, ORG_ID, SITE_NAME, WEBSITE_ID } from "./meta";
import { returnPolicyLd } from "./policy-ld";

/**
 * The store (OnlineStore ⊂ Organization) and the website, for the home page. Contacts are the ones
 * the site really shows: Telegram only (no phone/e-mail exist), pickup city Kharkiv.
 */
export function storeJsonLd(locale: Locale) {
  const t = makeT(locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "OnlineStore",
        "@id": ORG_ID,
        name: SITE_NAME,
        legalName: SELLER.name,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: LOGO_URL, width: 512, height: 512 },
        image: DEFAULT_OG_IMAGE.url,
        description: t("meta.description"),
        sameAs: [BOT_URL],
        address: { "@type": "PostalAddress", addressLocality: SELLER_LOCALITY[locale], addressCountry: "UA" },
        areaServed: { "@type": "Country", name: "Ukraine" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          url: `https://t.me/${OWNER_TELEGRAM}`,
          availableLanguage: ["uk", "ru", "en"],
          areaServed: "UA",
        },
        hasMerchantReturnPolicy: returnPolicyLd(),
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, "/")}`,
        inLanguage: LOCALE_TAG[locale],
        publisher: { "@id": ORG_ID },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}${localePath(locale, "/search")}?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}
