import { mutation } from "./_generated/server";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    // 🔍 DEBUG: check identity coming from Clerk → Convex
    const identity = await ctx.auth.getUserIdentity();

    console.log("=== AUTH DEBUG START ===");
    console.log("Identity:", identity);
    console.log("=== AUTH DEBUG END ===");

    if (!identity) {
      console.log("❌ AUTH FAILED: identity is null");
      throw new Error("User not authenticated");
    }

    console.log("✅ AUTH SUCCESS:");
    console.log("tokenIdentifier:", identity.tokenIdentifier);
    console.log("name:", identity.name);
    console.log("email:", identity.email);
    console.log("pictureUrl:", identity.pictureUrl);

    // 🔍 Check if user already exists
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (user !== null) {
      console.log("👤 Existing user found:", user);

      // Update name if changed
      if (user.name !== identity.name) {
        console.log("✏️ Updating user name");
        await ctx.db.patch(user._id, { name: identity.name });
      }

      return user._id;
    }

    // 🆕 Create new user
    console.log("🆕 Creating new user");

    const newUserId = await ctx.db.insert("users", {
      name: identity.name ?? "Anonymous",
      email: identity.email ?? "noemail@clerk.dev",
      tokenIdentifier: identity.tokenIdentifier,
      imageUrl: identity.pictureUrl,
    });

    console.log("✅ New user created with ID:", newUserId);

    return newUserId;
  },
});