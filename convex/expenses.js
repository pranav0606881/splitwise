import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─── createExpense (unchanged) ────────────────────────────────────────────────
export const createExpense = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    category: v.optional(v.string()),
    date: v.number(),
    paidByUserId: v.id("users"),
    splitType: v.string(),
    splits: v.array(v.object({ userId: v.id("users"), amount: v.number(), paid: v.boolean() })),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (!group) throw new Error("Group not found");
      if (!group.members.some((m) => m.userId === user._id))
        throw new Error("You are not a member of this group");
    }
    const totalSplitAmount = args.splits.reduce((sum, s) => sum + s.amount, 0);
    if (Math.abs(totalSplitAmount - args.amount) > 0.01)
      throw new Error("Split amounts must add up to the total expense amount");
    return await ctx.db.insert("expenses", {
      description: args.description,
      amount: args.amount,
      category: args.category || "Other",
      date: args.date,
      paidByUserId: args.paidByUserId,
      splitType: args.splitType,
      splits: args.splits,
      groupId: args.groupId,
      createdBy: user._id,
    });
  },
});

// ─── getExpensesBetweenUsers (unchanged) ──────────────────────────────────────
export const getExpensesBetweenUsers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await ctx.runQuery(internal.users.getCurrentUser);
    if (me._id === userId) throw new Error("Cannot query yourself");
    const myPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) => q.eq("paidByUserId", me._id).eq("groupId", undefined))
      .collect();
    const theirPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) => q.eq("paidByUserId", userId).eq("groupId", undefined))
      .collect();
    const expenses = [...myPaid, ...theirPaid].filter((e) => {
      const meInvolved = e.paidByUserId === me._id || e.splits.some((s) => s.userId === me._id);
      const themInvolved = e.paidByUserId === userId || e.splits.some((s) => s.userId === userId);
      return meInvolved && themInvolved;
    });
    expenses.sort((a, b) => b.date - a.date);
    const settlements = await ctx.db
      .query("settlements")
      .filter((q) =>
        q.and(
          q.eq(q.field("groupId"), undefined),
          q.or(
            q.and(q.eq(q.field("paidByUserId"), me._id), q.eq(q.field("receivedByUserId"), userId)),
            q.and(q.eq(q.field("paidByUserId"), userId), q.eq(q.field("receivedByUserId"), me._id))
          )
        )
      )
      .collect();
    settlements.sort((a, b) => b.date - a.date);
    let balance = 0;
    for (const e of expenses) {
      if (e.paidByUserId === me._id) {
        const split = e.splits.find((s) => s.userId === userId && !s.paid);
        if (split) balance += split.amount;
      } else {
        const split = e.splits.find((s) => s.userId === me._id && !s.paid);
        if (split) balance -= split.amount;
      }
    }
    for (const s of settlements) {
      if (s.paidByUserId === me._id) balance += s.amount;
      else balance -= s.amount;
    }
    const other = await ctx.db.get(userId);
    if (!other) throw new Error("User not found");
    return {
      expenses,
      settlements,
      otherUser: { id: other._id, name: other.name, email: other.email, imageUrl: other.imageUrl },
      balance,
    };
  },
});

// ─── deleteExpense (unchanged) ────────────────────────────────────────────────
export const deleteExpense = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");
    if (expense.createdBy !== user._id && expense.paidByUserId !== user._id)
      throw new Error("You don't have permission to delete this expense");
    const allSettlements = await ctx.db.query("settlements").collect();
    for (const settlement of allSettlements.filter((s) => s.relatedExpenseIds?.includes(args.expenseId))) {
      const updated = settlement.relatedExpenseIds.filter((id) => id !== args.expenseId);
      if (updated.length === 0) await ctx.db.delete(settlement._id);
      else await ctx.db.patch(settlement._id, { relatedExpenseIds: updated });
    }
    await ctx.db.delete(args.expenseId);
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLIFY DEBTS  —  Optimal Account Balancing (LeetCode 465)
// ─────────────────────────────────────────────────────────────────────────────
//
// ALGORITHM (from LLD Splitwise video):
// ──────────────────────────────────────
// Step 1 — Compute net balance per person
//   positive → creditor (owed money)
//   negative → debtor   (owes money)
//   zero     → skip
//
// Step 2 — DFS with backtracking
//   For current person (idx), try pairing with every later person
//   who has the OPPOSITE sign (one owes, other is owed).
//
//   On each pairing:
//     amount  = min(|cur|, |next|)      — smaller side fully settled
//     bals[j] = cur + next              — merge; carry remainder in bals[j]
//     recurse from idx + 1              — cur is now consumed
//     backtrack: restore bals[j] = next — try next candidate
//
//   Early exit: if cur + next == 0 (perfect cancellation) → break,
//   no pairing can produce a smaller remainder.
//
//   Track the globally minimum transaction list across all branches.
//
// WHY BETTER THAN GREEDY MIN-CASH-FLOW:
// ──────────────────────────────────────
//   Greedy pairs global max-creditor with max-debtor every time.
//   This is locally optimal but can miss globally better groupings.
//
//   Example  balances = [-4, -3, +2, +2, +3]
//     Greedy   → 4 transactions
//     DFS BT   → 3 transactions  ✅  (finds -4+2+2=0 and -3+3=0)
//
// COMPLEXITY: O(N!)  — N = people with non-zero balance (≤ 10-15 in practice)


const EPSILON = 0.005;

/**
 * Find the minimum-transaction settlement using DFS + backtracking.
 *
 * @param {{ [uid: string]: number }} netBalances
 * @returns {{ from: string, to: string, amount: number }[]}
 */
function optimalSettlement(netBalances) {
  // Filter out zero balances
  const people = Object.entries(netBalances).filter(
    ([, b]) => Math.abs(b) > EPSILON
  );
  if (!people.length) return [];

  const uids = people.map(([uid]) => uid);
  const bals = people.map(([, b]) => b); // mutable working copy
  const n = bals.length;

  let bestList  = null;
  let bestCount = Infinity;

  const dfs = (idx, txns) => {
    // Skip already-settled (zero) balances
    while (idx < n && Math.abs(bals[idx]) < EPSILON) idx++;

    // Base case: all balances settled
    if (idx >= n) {
      if (txns.length < bestCount) {
        bestCount = txns.length;
        bestList  = [...txns]; // snapshot best solution
      }
      return txns.length;
    }

    const cur = bals[idx];
    let min = Infinity;

    for (let j = idx + 1; j < n; j++) {
      const next = bals[j];

      // Only pair opposite signs: debtor ↔ creditor
      if (cur * next >= 0) continue;

      // Amount settled in this single transaction
      const amount = Math.round(Math.min(Math.abs(cur), Math.abs(next)) * 100) / 100;

      // Direction: negative balance = debtor (pays), positive = creditor (receives)
      const from = cur < 0 ? idx : j;
      const to   = cur < 0 ? j   : idx;

      // Merge cur into bals[j], recurse past idx
      bals[j] = cur + next;
      txns.push({ from, to, amount });

      const count = 1 + dfs(idx + 1, txns);
      if (count < min) min = count;

      // Backtrack
      txns.pop();
      bals[j] = next;

      // Perfect cancellation — break early, can't do better
      if (Math.abs(cur + next) < EPSILON) break;
    }

    return min === Infinity ? 0 : min;
  };

  dfs(0, []);

  return (bestList ?? []).map(({ from, to, amount }) => ({
    from: uids[from],
    to:   uids[to],
    amount,
  }));
}

// ─── getSimplifiedDebts query ─────────────────────────────────────────────────
export const getSimplifiedDebts = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await ctx.runQuery(internal.users.getCurrentUser);

    // ── Auth ──────────────────────────────────────────────────────────────────
    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.members.some((m) => m.userId === me._id))
      throw new Error("You are not a member of this group");

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    // ── Step 1: net balance per person ────────────────────────────────────────
    //   balance > 0  →  owed money  (creditor)
    //   balance < 0  →  owes money  (debtor)
    const balance = {};
    const add = (uid, amt) => { balance[uid] = (balance[uid] ?? 0) + amt; };

    for (const m of group.members) add(m.userId, 0); // initialise everyone

    for (const exp of expenses) {
      for (const split of exp.splits) {
        if (split.paid) continue;
        if (split.userId === exp.paidByUserId) continue;
        add(exp.paidByUserId, +split.amount); // payer is owed
        add(split.userId,     -split.amount); // participant owes
      }
    }

    for (const s of settlements) {
      add(s.paidByUserId,     +s.amount); // paid → debt reduced
      add(s.receivedByUserId, -s.amount); // received → credit reduced
    }

    // ── Step 2: DFS backtracking → optimal transaction list ───────────────────
    const simplified = optimalSettlement(balance);

    if (!simplified.length) {
      return { transactions: [], totalTransactions: 0, savedTransactions: 0 };
    }

    // ── Step 3: hydrate user info ─────────────────────────────────────────────
    const allUserIds = [...new Set(simplified.flatMap(({ from, to }) => [from, to]))];
    const userMap = {};
    await Promise.all(
      allUserIds.map(async (uid) => {
        const u = await ctx.db.get(uid);
        if (u) {
          userMap[uid] = {
            id:       u._id,
            name:     u.name,
            email:    u.email,
            imageUrl: u.imageUrl ?? null,
          };
        }
      })
    );

    const transactions = simplified.map(({ from, to, amount }) => ({
      from: userMap[from],
      to:   userMap[to],
      amount,
    }));

    // naive count = one txn per person with non-zero balance minus 1
    const nonZeroCount = Object.values(balance).filter(
      (b) => Math.abs(b) > EPSILON
    ).length;

    return {
      transactions,
      totalTransactions: transactions.length,
      savedTransactions: Math.max(0, (nonZeroCount - 1) - transactions.length),
    };
  },
});