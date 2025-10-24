export class SessionService {
  constructor() {}
  private get = (session: any, key: string) => {
    const data = session[key];
    if (!data) throw new Error(`${key} not defined on the session`);
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
    }: { email: string; deviceId: string; userId: string },
  ) {
    this.setEmail(sess, email);
    this.setDeviceId(sess, deviceId);
    this.setUserId(sess, userId);
  }
  getEmailOrThrow(sess: any) {
    return this.get(sess, "email");
  }
  getUserIdOrThrow(sess: any): string {
    return this.get(sess, "userId");
  }
}
