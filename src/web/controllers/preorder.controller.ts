import { Domain } from "@/domain/domain";
import { createPreorderSchema } from "@/domain/schemas/preorder";
import { Request, Response } from "express";
import { createErrorResponse, invalidInputErrorResponse } from "./utils";
import { createUserSchema } from "@/domain/schemas/users";
import { StatusCodes } from "http-status-codes";

export class PreorderController {
  constructor(private readonly domain: Domain) {}

  handleCreateUserAndPreorder = async (req: Request, res: Response) => {
    const combinedSchema = createUserSchema
      .extend(
        createPreorderSchema.pick({
          choice: true,
        }).shape,
      )
      .strict()
      .safeParse(req.body);

    if (combinedSchema.error) {
      const { issues } = combinedSchema.error;
      return invalidInputErrorResponse(res, issues, req.url);
    }
    const { data: input } = combinedSchema;

    const user = await this.domain.user.registerUser({
      deviceFingerprint: input.deviceFingerprint,
      email: input.email,
      name: input.name,
      shippingAddress: input.shippingAddress,
      password: input.password,
      userAgent: input.userAgent,
    });

    const canAcceptPreorder = await this.domain.preorders.canAcceptPreorder();

    if (!canAcceptPreorder)
      return createErrorResponse(res, {
        statusCode: StatusCodes.FORBIDDEN,
        error: "Cannot accept preorders",
        endpoint: req.url,
      });

    const preoder = await this.domain.preorders.registerPreorder({
      choice: input.choice,
      userId: user.id,
      email: user.email,
    });

    this.domain.session.setLoginInfo(req.session, {
      userId: user.id,
      email: user.email,
      deviceId: user.deviceId,
    });

    res.status(200).json(preoder);
  };

  handleCreatePreorder = async (req: Request, res: Response) => {
    const createPreoderInput = createPreorderSchema.safeParse({
      userId: this.domain.session.getUserId(req.session),
      ...req.body,
    });

    if (!createPreoderInput.success) {
      const { issues } = createPreoderInput.error;
      return invalidInputErrorResponse(res, issues, req.url);
    }

    const canAcceptPreorder = this.domain.preorders.canAcceptPreorder();
    if (!canAcceptPreorder)
      return createErrorResponse(res, {
        statusCode: StatusCodes.FORBIDDEN,
        error: "Cannot accept preorders",
        endpoint: req.url,
      });

    const { userId, choice } = createPreoderInput.data;

    const { preorderId, url, amount, currency } =
      await this.domain.preorders.registerPreorder({
        userId,
        choice,
        email: this.domain.session.getEmailOrThrow(req.session),
      });
  };
}
