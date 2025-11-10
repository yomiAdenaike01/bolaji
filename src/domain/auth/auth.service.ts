import { Db } from "@/infra/index.js";
import { UserService } from "../user/users.service.js";
import bcrypt from "bcrypt";
import { logger } from "@/lib/logger.js";
import { Config } from "@/config/index.js";

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly userService: UserService,
  ) {}
  authenticateWorkspaceUser(
    email: string,
    workspacePassword: string,
  ): { email: string } | null {
    const { allowedEmails, password } = this.config.workspace;

    if (allowedEmails.includes(email) && workspacePassword === password)
      return { email };
    return null;
  }

  updatePasswordByEmail = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }) => {
    const hashed = await bcrypt.hash(password, 10);
    const user = await this.db.user.update({
      where: {
        email,
      },
      data: {
        passwordHash: hashed,
      },
    });
    if (!user) throw new Error("User not found");
  };
  authenticateUser = async (input: {
    principal: string;
    password: string;
    deviceFingerprint: string;
    userAgent: string;
  }) => {
    return this.db.$transaction(async (tx) => {
      const existingUser = await tx.user.findUniqueOrThrow({
        where: {
          email: input.principal,
        },
      });

      logger.info(
        `[Auth] Logging in email=${existingUser.email} with password=${input.password} `,
      );

      if (!existingUser.passwordHash) throw new Error("Failed to find user");
      const isSame = bcrypt.compareSync(
        input.password,
        existingUser.passwordHash,
      );
      if (!isSame) throw new Error("Incorrect password");
      const device = await this.userService.findOrRegisterDevice({
        tx: tx,
        deviceFingerprint: input.deviceFingerprint,
        userAgent: input.userAgent,
        userId: existingUser.id,
      });

      return {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        createdAt: existingUser.createdAt,
        deviceId: device.id,
      };
    });
  };
}
