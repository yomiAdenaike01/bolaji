import { PlanType } from "@/generated/prisma/enums";

export const PREORDER_EDITION_MAX_COPIES = 300;
export const EDITION_00_REMANING_CACHE_KEY = "edition:0:remaining";
export const PREORDER_OPENING_DATETIME = new Date("2025-11-07T17:00:00Z");

export const PREORDER_CLOSING_DATETIME = new Date("2025-11-09T14:35:00Z");
export const EDITION_00_RELEASE = PREORDER_CLOSING_DATETIME;
export const EDITION_01_RELEASE = new Date("2025-12-01T09:00:00Z");

export const DEFAULT_PLANS = [
  {
    type: PlanType.FULL,
    name: "Full Access (Digital + Physical)",
    priceCents: 2000,
    currency: "GBP",
  },
  {
    type: PlanType.PHYSICAL,
    name: "Physical Edition Subscription",
    priceCents: 1800,
    currency: "GBP",
  },
  {
    type: PlanType.DIGITAL,
    name: "Digital Access Subscription",
    priceCents: 500,
    currency: "GBP",
  },
];

// TODO: Set the preorder opening date and then set the release to 48 hours later

// Bolaji editions is a 12 part collectable art publication each edition is released monthly forming a complete set over a year edition 00 is the special prelaunch edition from november 9th the full ongoing bolaji editions subscrtiption begins with the first edition starting in December 2025
// Access to the limited Edition 00 is only avaliable for 48 hours, until it's released to the wider public.
