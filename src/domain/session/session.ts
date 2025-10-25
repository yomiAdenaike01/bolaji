export class SessionError extends Error {
  constructor(message: string) {
    super(message);
  }
}
export class SessionService {
  constructor() {}
  private getOrThrow = (session: any, key: string) => {
    const data = session[key];
    if (!data) throw new SessionError(`${key} not defined on the session`);
    return data;
  };
  getUserEmail(session: any): string {
    return session.email;
  }
  getUserId(sess: any): string | undefined {
    return sess.userId;
  }
  setUserId(sess: any, userId: string) {
    sess.userId = userId;
  }
  setDeviceId(sess: any, deviceId: string) {
    sess.deviceId = deviceId;
  }
  setEmail(sess: any, email: string) {
    sess.email = email;
  }
  setLoginInfo(
    sess: any,
    {
      email,
      deviceId,
      userId,
      addressId,
    }: {
      addressId?: string | null;
      email: string;
      deviceId: string;
      userId: string;
    },
  ) {
    this.setEmail(sess, email);
    this.setDeviceId(sess, deviceId);
    this.setUserId(sess, userId);
    sess.addressId = addressId;
  }
  getCurrentAddress(sess: any): string | null {
    return sess.addressId || null;
  }
  getEmailOrThrow(sess: any) {
    return this.getOrThrow(sess, "email");
  }
  getUserIdOrThrow(sess: any): string {
    return this.getOrThrow(sess, "userId");
  }
}
