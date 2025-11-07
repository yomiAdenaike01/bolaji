import { PlanType } from "@/generated/prisma/enums";
import countries from "i18n-iso-countries";

countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
export type ShippingZone = "UK" | "EUROPE" | "ROW";

const SHIPPING_PRICES: Record<ShippingZone, number> = {
  UK: 385,
  EUROPE: 720,
  ROW: 1310,
};

const COUNTRY_ZONE_MAP: Record<string, "UK" | "EUROPE"> = {
  GB: "UK",
  AD: "EUROPE",
  AT: "EUROPE",
  BE: "EUROPE",
  BG: "EUROPE",
  HR: "EUROPE",
  CY: "EUROPE",
  CZ: "EUROPE",
  DK: "EUROPE",
  EE: "EUROPE",
  FI: "EUROPE",
  FR: "EUROPE",
  DE: "EUROPE",
  GR: "EUROPE",
  HU: "EUROPE",
  IS: "EUROPE",
  IE: "EUROPE",
  IT: "EUROPE",
  LV: "EUROPE",
  LI: "EUROPE",
  LT: "EUROPE",
  LU: "EUROPE",
  MT: "EUROPE",
  MC: "EUROPE",
  NL: "EUROPE",
  NO: "EUROPE",
  PL: "EUROPE",
  PT: "EUROPE",
  RO: "EUROPE",
  SM: "EUROPE",
  SK: "EUROPE",
  SI: "EUROPE",
  ES: "EUROPE",
  SE: "EUROPE",
  CH: "EUROPE",
};

export class PricingService {
  getShippingPrice = (countryNameOrCode: string) => {
    const zone = this.getShippingZone(countryNameOrCode);
    return SHIPPING_PRICES[zone];
  };

  getShippingZone = (countryNameOrCode: string): ShippingZone => {
    if (!countryNameOrCode) return "ROW";

    if (countryNameOrCode === "EUROPE") return countryNameOrCode;

    // Try to get ISO code from full name
    const isoCode =
      countries.getAlpha2Code(countryNameOrCode, "en") ||
      countries.getAlpha2Code(countryNameOrCode.toUpperCase(), "en");

    // Normalize to upper case for lookup
    const code = (isoCode || countryNameOrCode).toUpperCase();

    if (COUNTRY_ZONE_MAP[code]) {
      return COUNTRY_ZONE_MAP[code];
    }

    // Default fallback
    return "ROW";
  };

  getPreorderProductPrice(choice: PlanType) {
    switch (choice) {
      case "DIGITAL":
        return 500;
      case "PHYSICAL":
      case "FULL":
        return 2000;
      default:
        throw new Error("Invalid plan type");
    }
  }
}
