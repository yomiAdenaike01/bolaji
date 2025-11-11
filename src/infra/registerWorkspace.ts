import { Database, Resource, getModelByName } from "@adminjs/prisma";
import AdminJS from "adminjs";
import { PrismaClient } from "@prisma/client";
import { Config } from "@/config/index.js";
import { Domain } from "@/domain/domain.js";

AdminJS.registerAdapter({ Database, Resource });

export const registerWorkspace = (config: Config, domain: Domain) => {
  const db = new PrismaClient();

  const workspace = new AdminJS({
    resources: [
      {
        resource: { model: getModelByName("User"), client: db },
        options: {
          navigation: {
            name: "Users & Access",
            icon: "User", // icon from lucide-react (AdminJS uses it)
            order: 1, // position in sidebar
          },
        },
      },
      {
        resource: { model: getModelByName("Device"), client: db },
      },
      {
        resource: { model: getModelByName("Edition"), client: db },
      },
      {
        resource: { model: getModelByName("EditionAccess"), client: db },
      },
      {
        resource: { model: getModelByName("SubscriptionPlan"), client: db },
      },
      {
        resource: { model: getModelByName("Subscription"), client: db },
      },
      {
        resource: { model: getModelByName("Preorder"), client: db },
      },
      {
        resource: { model: getModelByName("Order"), client: db },
      },
      {
        resource: { model: getModelByName("Payment"), client: db },
      },
      {
        resource: { model: getModelByName("Shipment"), client: db },
      },
      {
        resource: { model: getModelByName("Address"), client: db },
      },
    ],
    rootPath: "/workspace",
    branding: {
      companyName: "Bolaji Editions",
      logo: `${config.serverUrl}/images/logo.png`,
      withMadeWithLove: false,
    },
  });
  return workspace;
};
