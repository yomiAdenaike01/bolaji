// src/tests/mockEmailPayloads.ts
import { EmailType, AdminEmailType } from "@/infra/integrations/email-types";
import { PlanType } from "@/generated/prisma/enums";
import { Config } from "@/config";
import { initConfig } from "@/config";

const mockUserEmails = (config: Config) => ({
  [EmailType.EDITION_00_DIGITAL_RELEASE]: {
    name: "Ade",
    planType: PlanType.DIGITAL,
    resetPasswordLink: `${config.frontEndUrl}/auth/reset-password`,
    accessLink: `${config.frontEndUrl}/auth/login`,
    subscribeLink: `${config.frontEndUrl}/subscription/dashboard-subscription`,
  },
  [EmailType.SUBSCRIPTION_FAILED_TO_START]: {
    name: "Ade",
    email: "email@example.com",
    plan: PlanType.FULL,
    reason: "Payment authorization failed",
    resetLink: `${config.frontEndUrl}/edition.00/payment`,
  },
  [EmailType.SUBSCRIPTION_STARTED]: {
    name: "Ade",
    planType: PlanType.DIGITAL,
    nextEdition: 1,
    newPassword: "Password",
  },
  [EmailType.NEW_EDITION_RELEASED]: {
    name: "Ade",
    editionTitle: "Edition 01",
    editionCode: "01",
  },
  [EmailType.REGISTER]: {
    name: "Ade",
    email: "email@example.com",
    password: "temp1234",
  },
  [EmailType.PREORDER_CONFIRMATION]: {
    name: "Ade",
    email: "email@example.com",
    editionCode: "00",
    plan: PlanType.PHYSICAL,
    newPassword: "Bolaji#2025",
  },
  [EmailType.PAYMENT_FAILED]: {
    name: "Ade",
    email: "email@example.com",
    reason: "Card declined",
  },
  [EmailType.PASSWORD_RESET]: {
    name: "Ade",
    email: "email@example.com",
    resetLink: "https://bolaji.app/reset/token123",
  },
  [EmailType.SUBSCRIPTION_RENEWED]: {
    name: "Ade",
    email: "email@example.com",
    nextEdition: "Edition 02",
  },
  [EmailType.PREORDER_RELEASED]: {
    name: "Ade",
    preorderLink: "https://bolaji.app/preorder/edition1",
    password: "PrivateAccess123",
    accountPassword: "Bolaji#2025",
  },
  [EmailType.PREORDER_PAYMENT_FAILED]: {
    name: "Ade",
    email: "email@example.com",
    editionCode: "01",
    plan: PlanType.PHYSICAL,
    reason: "Card expired",
    retryLink: "https://bolaji.app/retry-preorder",
  },
});

export const mockAdminEmails = {
  [AdminEmailType.NEW_USER]: {
    name: "Ade",
    email: "email@example.com",
    address: {
      fullName: "Ade Adegbulugbe",
      line1: "221B Baker Street",
      line2: "",
      city: "London",
      state: "",
      postalCode: "NW1 6XE",
      country: "UK",
      phone: "+44 7000 000000",
    },
  },
  [AdminEmailType.NEW_PREORDER]: {
    name: "Ade",
    email: "email@example.com",
    plan: "Physical",
    editionCode: "00",
    amount: "£65",
    quantity: 1,
  },
  [AdminEmailType.SUBSCRIPTION_STARTED]: {
    name: "Ade",
    email: "email@example.com",
    plan: "Full",
    periodStart: new Date(),
    periodEnd: new Date("2025-12-01"),
  },
  [AdminEmailType.SUBSCRIPTION_RENEWED]: {
    name: "Ade",
    email: "email@example.com",
    plan: "Digital",
    renewedAt: "2025-11-01",
    nextPeriodEnd: "2025-12-01",
  },
  [AdminEmailType.SUBSCRIPTION_CANCELED]: {
    name: "Ade",
    email: "email@example.com",
    plan: "Full",
    canceledAt: "2025-11-03",
  },
  [AdminEmailType.SUPPORT_TICKET_CREATED]: {
    name: "Ade",
    email: "email@example.com",
    subject: "Login issue",
    category: "Account",
    ticketId: "SUP-93248",
  },
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]: {
    totalSent: 450,
    totalFailed: 3,
  },
  [AdminEmailType.EDITION_PUBLISH_REQUEST]: {
    editionId: "ed_001",
    editionCode: "01",
    editionTitle: "Thresholds",
    totalPreorders: 120,
  },
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: {
    timeOfDay: "morning",
  },
};

export function getMockPayloadFor(type: EmailType | AdminEmailType) {
  const config = initConfig();
  const allMocks = mockUserEmails(config);
  return allMocks[type];
}
