import { Config } from "../../config";
import { StripeIntegration } from "./stripe.integration";
import { EmailIntegration } from "./email.integration";
import { Db } from "@/infra";
import { AdminEmailIntegration } from "./admin.email.integration";

export class Integrations {
  public readonly payments: StripeIntegration;
  public readonly email: EmailIntegration;
  public readonly adminEmail: AdminEmailIntegration;
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
      adminEmailAddresses,
    } = this.appConfig;

    const emailIntegration = new EmailIntegration(
      resendApiKey,
      sentFromEmailAddr,
    );

    const adminEmailIntegration = new AdminEmailIntegration(
      resendApiKey,
      adminEmailAddresses,
      db,
      sentFromEmailAddr,
    );

    this.payments = new StripeIntegration(
      stripeApiKey,
      stripeWebhookSecret,
      stripePaymentRedirectUrl,
    );

    this.email = emailIntegration;
    this.adminEmail = adminEmailIntegration;
  }
}
