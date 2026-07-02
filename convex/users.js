import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const store = mutation({
  args: {
    authIdentifier: v.optional(v.string()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    const normalize = (value) => value?.trim() || null;
    const email = normalize(args.email ?? identity.email);
    const authIdentifier =
      normalize(args.authIdentifier) ||
      normalize(identity.sub) ||
      normalize(identity.subject) ||
      normalize(identity.userId) ||
      normalize(identity.tokenIdentifier);
    const name =
      normalize(args.name) ||
      normalize(identity.name) ||
      (email ? email.split("@")[0] : null) ||
      "Anonymous";
    const imageUrl = normalize(args.imageUrl ?? identity.pictureUrl);

    let user = null;
    if (authIdentifier) {
      user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) =>
          q.eq("tokenIdentifier", authIdentifier)
        )
        .unique();
    }

    if (!user && email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
    }

    if (user !== null) {
      const patchData = {};
      if ((user.name || "") !== name) patchData.name = name;
      if ((user.email || "") !== (email || "")) patchData.email = email;
      if ((user.imageUrl || "") !== (imageUrl || "")) patchData.imageUrl = imageUrl;
      if (authIdentifier && (user.tokenIdentifier || "") !== authIdentifier) {
        patchData.tokenIdentifier = authIdentifier;
      }
      if (Object.keys(patchData).length > 0) {
        await ctx.db.patch(user._id, patchData);
      }
      return user._id;
    }

    return await ctx.db.insert("users", {
      name,
      tokenIdentifier: authIdentifier ?? (email ?? ""),
      email,
      imageUrl,
    });
  },
});

// Get current user (creates if doesn't exist)
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const normalize = (value) => value?.trim() || null;
    const email = normalize(identity.email);
    const authIdentifier =
      normalize(identity.sub) ||
      normalize(identity.subject) ||
      normalize(identity.userId) ||
      normalize(identity.tokenIdentifier);

    let user = null;
    if (authIdentifier) {
      user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) =>
          q.eq("tokenIdentifier", authIdentifier)
        )
        .first();
    }

    if (!user && email) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
    }

    const normalizedName =
      normalize(identity.name) ||
      (email ? email.split("@")[0] : null) ||
      "Anonymous";

    // Auto-create user if it doesn't exist
    if (!user) {
      const userId = await ctx.db.insert("users", {
        name: normalizedName,
        tokenIdentifier: authIdentifier ?? (email ?? ""),
        email,
        imageUrl: identity.pictureUrl,
      });
      user = await ctx.db.get(userId);
    }

    return user;
  },
});

// Search users by name or email (for adding participants)
export const searchUsers = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    // Use centralized getCurrentUser function
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    // Don't search if query is too short
    if (args.query.length < 2) {
      return [];
    }

    // Search by name using search index
    const nameResults = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .collect();

    // Search by email using search index
    const emailResults = await ctx.db
      .query("users")
      .withSearchIndex("search_email", (q) => q.search("email", args.query))
      .collect();

    // Combine results (removing duplicates)
    const users = [
      ...nameResults,
      ...emailResults.filter(
        (email) => !nameResults.some((name) => name._id === email._id)
      ),
    ];

    // Exclude current user and format results
    return users
      .filter((user) => user._id !== currentUser._id)
      .map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      }));
  },
});

// Get current user (public query for client)
export const getCurrentUserPublic = query({
  handler: async (ctx) => {
    return await ctx.runQuery(internal.users.getCurrentUser);
  },
});