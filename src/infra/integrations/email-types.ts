import { ShippingAddress } from "@/domain/schemas/users";
import { PlanType } from "@/generated/prisma/enums";

export type PreorderReleaseContent = {
  name: string;
  preorderLink: string;
  password: string;
  accountPassword: string;
};

export enum AdminEmailType {
  NEW_USER = "NEW_USER",
  NEW_PREORDER = "NEW_PREORDER",
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED", // 👈 NEW
  SUBSCRIPTION_CANCELED = "SUBSCRIPTION_CANCELED",
  SUPPORT_TICKET_CREATED = "SUPPORT_TICKET_CREATED",
  WAITLIST_PREORDER_RELEASE_SUMMARY = "WAITLIST_PREORDER_RELEASE_SUMMARY",
  EDITION_PUBLISH_REQUEST = "EDITION_PUBLISH_REQUEST", // 👈 NEW
  SUBSCRIBER_DAILY_DIGEST = "SUBSCRIBER_DAILY_DIGEST",
}

export type AdminEmailContent = {
  [AdminEmailType.SUBSCRIBER_DAILY_DIGEST]: {
    timeOfDay: "morning" | "night";
  };
  [AdminEmailType.WAITLIST_PREORDER_RELEASE_SUMMARY]: {
    totalSent: number;
    totalFailed: number;
  };

  [AdminEmailType.NEW_USER]: {
    name: string;
    email: string;
    address?: ShippingAddress;
  };

  [AdminEmailType.NEW_PREORDER]: {
    name: string;
    email: string;
    plan: string;
    editionCode: string;
    amount: string;
    quantity: number;
    address?: ShippingAddress;
  };

  [AdminEmailType.SUBSCRIPTION_STARTED]: {
    name: string;
    email: string;
    plan: string;
    periodStart: string | Date;
    periodEnd: string | Date;
  };

  [AdminEmailType.SUBSCRIPTION_RENEWED]: {
    name: string;
    email: string;
    plan: string;
    renewedAt: string;
    nextPeriodEnd: string;
  };

  [AdminEmailType.SUBSCRIPTION_CANCELED]: {
    name: string;
    email: string;
    plan: string;
    canceledAt: string;
  };

  [AdminEmailType.SUPPORT_TICKET_CREATED]: {
    name: string;
    email: string;
    subject: string;
    category: string;
    ticketId: string;
  };

  [AdminEmailType.EDITION_PUBLISH_REQUEST]: {
    editionId: string;
    editionCode: string;
    editionTitle: string;
    totalPreorders: number;
  };
};

export enum EmailType {
  EDITION_00_DIGITAL_RELEASE = "EDITION_00_DIGITAL_RELEASE",
  // EDITION_00_DIGITAL_RELEASE_REMINDER = "EDITION_00_DIGITAL_RELEASE_REMINDER",
  SUBSCRIPTION_FAILED_TO_START = "SUBSCRIPTION_FAILED_TO_START",
  REGISTER = "REGISTER",
  PREORDER_CONFIRMATION = "PREORDER_CONFIRMATION",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PASSWORD_RESET = "PASSWORD_RESET",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  PREORDER_RELEASED = "PREORDER_RELEASED",
  PREORDER_RELEASED_REMINDER = "PREORDER_RELEASED_REMINDER",

  NEW_EDITION_RELEASED = "NEW_EDITION_RELEASED",
  PREORDER_PAYMENT_FAILED = "PREORDER_PAYMENT_FAILED",
  EDITIONS_INTRODUCTION = 'EDITIONS_INTRODUCTION'
}

export interface EmailContentMap {
  [EmailType.EDITIONS_INTRODUCTION]: undefined
  [EmailType.EDITION_00_DIGITAL_RELEASE]: {
    name: string;
    subscribeLink: string;
    planType: PlanType;
    resetPasswordLink: string;
  };
  [EmailType.SUBSCRIPTION_FAILED_TO_START]: {
    name: string;
    email: string;
    plan: PlanType;
    reason?: string;
    retryLink: string; // Link to retry the subscription checkout
  };
  [EmailType.SUBSCRIPTION_STARTED]: {
    name: string;
    planType: PlanType;
    nextEdition: number;
    newPassword?: string;
    isPrerelease?: boolean;
  };

  [EmailType.NEW_EDITION_RELEASED]: {
    name: string;
    editionTitle: string;
    editionCode: string;
    planType: PlanType;
    editionsCollectionUrl: string;
  };

  [EmailType.REGISTER]: {
    name: string;
    email: string;
    password?: string;
  };

  [EmailType.PREORDER_CONFIRMATION]: {
    name: string;
    email: string;
    editionCode: string;
    plan: PlanType;
    newPassword?: string;
  };

  [EmailType.PAYMENT_FAILED]: {
    name: string;
    email: string;
    reason?: string;
  };

  [EmailType.PASSWORD_RESET]: {
    name: string;
    email: string;
    resetLink: string;
  };

  [EmailType.SUBSCRIPTION_RENEWED]: {
    name: string;
    email: string;
    nextEdition: string;
  };

  [EmailType.PREORDER_RELEASED]: PreorderReleaseContent;
  [EmailType.PREORDER_RELEASED_REMINDER]: PreorderReleaseContent;

  // 🆕 Preorder Payment Failed
  [EmailType.PREORDER_PAYMENT_FAILED]: {
    name: string;
    email: string;
    editionCode: string;
    plan: PlanType;
    reason?: string;
    retryLink?: string; // optional link to retry checkout
  };
}

// at 2pm subscriptions + people with editionsAccess get the email that it's released
// home page enter button goes to subscriptions + guard is removed
// full editions purchase button gets disabled and set to No longer avaliable
// subscriptions OPEN
//
