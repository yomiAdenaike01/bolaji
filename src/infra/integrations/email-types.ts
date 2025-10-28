import { ShippingAddress } from "@/domain/schemas/users";
import { PlanType } from "@/generated/prisma/enums";

export enum AdminEmailType {
  NEW_USER = "NEW_USER",
  NEW_PREORDER = "NEW_PREORDER",
  SUBSCRIPTION_STARTED = "SUBSCRIPTION_STARTED",
  SUBSCRIPTION_CANCELED = "SUBSCRIPTION_CANCELED",
  SUPPORT_TICKET_CREATED = "SUPPORT_TICKET_CREATED",
  WAITLIST_PREORDER_RELEASE_SUMMARY = "WAITLIST_PREORDER_RELEASE_SUMMARY",
}

export type AdminEmailContent = {
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
    address?: ShippingAddress;
  };
  [AdminEmailType.SUBSCRIPTION_STARTED]: {
    name: string;
    email: string;
    plan: string;
    periodStart: string;
    periodEnd: string;
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
};

export enum EmailType {
  REGISTER = "REGISTER",
  PREORDER_CONFIRMATION = "PREORDER_CONFIRMATION",
  PAYMENT_FAILED = "PAYMENT_FAILED",
  PASSWORD_RESET = "PASSWORD_RESET",
  SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
  PREORDER_RELEASED = "PREORDER_RELEASED",
  NEW_EDITION_RELEASED = "NEW_EDITION_RELEASED", // 👈 NEW
}

export interface EmailContentMap {
  [EmailType.NEW_EDITION_RELEASED]: {
    name: string;
    editionTitle: string;
    editionCode: string;
    editionLink: string;
  };
  [EmailType.REGISTER]: {
    name: string;
    email: string;
  };
  [EmailType.PREORDER_CONFIRMATION]: {
    name: string;
    email: string;
    editionCode: string;
    plan: PlanType;
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
  [EmailType.PREORDER_RELEASED]: {
    name: string;
    preorderLink: string;
    password: string;
  };
}
