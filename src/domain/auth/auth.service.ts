import { Db } from "@/infra";
import { UserService } from "../user/users.service";
import bcrypt from "bcrypt";
import { Prisma } from "@/generated/prisma/client";

export class AuthService {
  loginAsDev = async () => {
    const user = await this.db.user.findFirst({
      where: {
        email: "adenaikeyomi@gmail.com",
      },
    });
    return user;
  };
  constructor(
    private readonly db: Db,
    private readonly userService: UserService,
  ) {}
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
