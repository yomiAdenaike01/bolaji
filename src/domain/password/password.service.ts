import bcrpyt from "bcrypt";
import crypto from "crypto";

export type GeneratedPassword = {
  plainPassword: string;
  hashedPassword: string;
};
export class PasswordService {
  generatePassword = async (): Promise<GeneratedPassword> => {
    const newPassword = crypto.randomBytes(6).toString("base64url");
    const hashed = await bcrpyt.hash(newPassword, 10);
    return {
      plainPassword: newPassword,
      hashedPassword: hashed,
    };
  };
}
