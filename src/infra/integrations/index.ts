import { Config } from "../../config";
import { StripeIntegration } from "./stripe.integration";
import { EmailIntegration } from "./email.integration";
import { Db } from "@/infra";

export class Integrations {
  public readonly payments: StripeIntegration;
  public readonly email: EmailIntegration;
  constructor(
    db: Db,
    private readonly appConfig: Config,
  ) {
    const {
      stripeApiKey,
      stripeWebhookSecret,
      resendApiKey,
      sentFromEmailAddr,
      stripePaymentRedirectUrl,
    } = this.appConfig;

    const emailIntegration = new EmailIntegration(
      resendApiKey,
      sentFromEmailAddr,
    );

    this.payments = new StripeIntegration(
      stripeApiKey,
      stripeWebhookSecret,
      stripePaymentRedirectUrl,
      db,
      emailIntegration,
    );

    this.email = emailIntegration;
  }
}
