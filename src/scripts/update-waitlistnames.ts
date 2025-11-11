import { initConfig } from "@/config/index.js";
import { initInfra } from "@/infra/index.js";
/**
 * @description Only firstnames are stored in the db right now if want to update then do this
 * @deprecated
 */
const updateNames = async (waitlist: Array<any>) => {
  const config = initConfig();
  const { db } = await initInfra(config);

  const emailMap = new Map(
    waitlist.map((u) => [
      u.Email.trim(),
      `${u["First name"].trim()} ${u["Last name"].trim()}`,
    ]),
  );
  const emails = Array.from(emailMap.keys()) as string[];
  // 2️⃣ Get all matching users in a single query
  const existingUsers = await db.user.findMany({
    where: {
      email: { in: emails },
    },
    select: { id: true, email: true, name: true },
  });

  console.log(
    `Found ${existingUsers.length} existing users out of ${waitlist.length}`,
  );

  // 3️⃣ Prepare update operations only where name actually differs
  const updates = existingUsers
    .map((u) => {
      const newName = emailMap.get(u.email.toLowerCase());
      if (!newName || u.name === newName) return null;

      return db.user.update({
        where: { id: u.id },
        data: { name: newName },
      });
    })
    .filter(Boolean);

  if (!updates.length) {
    console.log("No name updates required.");
    return;
  }

  console.log(`Updating ${updates.length} users...`);

  // 4️⃣ Run in batched transactions (safer for large sets)
  const BATCH_SIZE = 50;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await db.$transaction(batch as any);
    console.log(`✅ Updated batch ${i / BATCH_SIZE + 1}`);
  }

  console.log("🎉 All name updates complete!");
};
