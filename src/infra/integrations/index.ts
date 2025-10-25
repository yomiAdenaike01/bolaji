import { Config } from "../../config";
import { StripeIntegration } from "./stripe.integration";
import { EmailIntegration } from "./email.integration";

export class Integrations {
  public readonly payments: StripeIntegration;
  public readonly email: EmailIntegration;
  constructor(private readonly appConfig: Config) {
    this.payments = new StripeIntegration(this.appConfig.stripeApiKey);
    this.email = new EmailIntegration(
      appConfig.resendApiKey,
      appConfig.sentFromEmailAddr,
    );
  }
}
