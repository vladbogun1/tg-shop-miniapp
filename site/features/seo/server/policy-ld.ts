import "server-only";
import { SELLER, SITE_URL } from "@/lib/config";

// ---------------------------------------------------------------- schema.org

/** Store-wide return policy (site/content/legal/uk/returns.md): 14 days, by mail, buyer pays postage. */
export function returnPolicyLd(markdown = false) {
  if (markdown) {
    // «Уцінка»: sold with stated defects and not returnable for them (returns.md, «Уцінені товари»).
    return {
      "@type": "MerchantReturnPolicy",
      applicableCountry: "UA",
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    };
  }
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "UA",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  };
}

/**
 * Delivery (delivery-payment.md): Nova Poshta across Ukraine, shipped in 1–2 business days, 1–3 days
 * in transit. The price is the carrier's tariff paid by the buyer on receipt, so there is no fixed
 * `shippingRate` to state.
 */
export function shippingLd() {
  return {
    "@type": "OfferShippingDetails",
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
      transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
    },
  };
}

