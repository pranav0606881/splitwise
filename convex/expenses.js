import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Create a new expense
export const createExpense = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    category: v.optional(v.string()),
    date: v.number(), // timestamp
    paidByUserId: v.id("users"),
    splitType: v.string(), 
    splits: v.array(
      v.object({
        userId: v.id("users"),
        amount: v.number(),
        paid: v.boolean(),
      })
    ),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (!group) throw new Error("Group not found");

      const isMember = group.members.some((member) => member.userId === user._id);
      if (!isMember) throw new Error("You are not a member of this group");
    }

    const totalSplitAmount = args.splits.reduce((sum, split) => sum + split.amount, 0);
    if (Math.abs(totalSplitAmount - args.amount) > 0.01) {
      throw new Error("Split amounts must add up to the total expense amount");
    }

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

// ----------- Expenses Page -----------

export const getExpensesBetweenUsers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await ctx.runQuery(internal.users.getCurrentUser);
    if (me._id === userId) throw new Error("Cannot query yourself");

    const myPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", me._id).eq("groupId", undefined)
      )
      .collect();

    const theirPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", userId).eq("groupId", undefined)
      )
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
            q.and(
              q.eq(q.field("paidByUserId"), me._id),
              q.eq(q.field("receivedByUserId"), userId)
            ),
            q.and(
              q.eq(q.field("paidByUserId"), userId),
              q.eq(q.field("receivedByUserId"), me._id)
            )
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

// Delete an expense
export const deleteExpense = mutation({
  args: { expenseId: v.id("expenses") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    const expense = await ctx.db.get(args.expenseId);
    if (!expense) throw new Error("Expense not found");

    if (expense.createdBy !== user._id && expense.paidByUserId !== user._id) {
      throw new Error("You don't have permission to delete this expense");
    }

    const allSettlements = await ctx.db.query("settlements").collect();
    const relatedSettlements = allSettlements.filter(
      (s) => s.relatedExpenseIds?.includes(args.expenseId)
    );

    for (const settlement of relatedSettlements) {
      const updated = settlement.relatedExpenseIds.filter((id) => id !== args.expenseId);
      if (updated.length === 0) {
        await ctx.db.delete(settlement._id);
      } else {
        await ctx.db.patch(settlement._id, { relatedExpenseIds: updated });
      }
    }

    await ctx.db.delete(args.expenseId);
    return { success: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLIFY DEBTS
// ─────────────────────────────────────────────────────────────────────────────
//
// Algorithm: "Minimum Cash Flow" (greedy)
// ───────────────────────────────────────
// 1. Sum every unpaid expense split and every settlement into a single
//    net-balance number per person:
//      positive → this person is owed money overall
//      negative → this person owes money overall
//
// 2. Repeatedly pair the largest creditor with the largest debtor and
//    transfer min(credit, debt) between them.  Repeat until all balances
//    reach zero.
//
// This always produces ≤ (N − 1) transfers for N people — the theoretical
// minimum — compared to the O(N²) transfers a naive pairwise approach needs.
//
// To RECORD a simplified settlement the UI calls the existing
// `createSettlement` mutation in settlement.js with the groupId set —
// no new mutation is required.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert `item` into an ascending-sorted array using binary search.
 * Keeps the heap O(log n) without an extra library.
 */
function insertSorted(arr, item) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].amount < item.amount) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, item);
}

/**
 * Pure function: given { userId → netBalance }, return the minimum list of
 * { from, to, amount } transfers that clears every debt.
 *
 * @param {{ [userId: string]: number }} balances
 * @returns {{ from: string, to: string, amount: number }[]}
 */
function minCashFlow(balances) {
  const EPSILON = 0.005; // ignore sub-half-cent floating-point noise

  const creditors = []; // owed money  (balance > 0)  — ascending by amount
  const debtors = [];   // owe money   (balance < 0)  — ascending by amount

  for (const [userId, bal] of Object.entries(balances)) {
    if (bal > EPSILON)  insertSorted(creditors, { userId, amount: bal });
    else if (bal < -EPSILON) insertSorted(debtors, { userId, amount: -bal });
  }

  const transactions = [];

  while (creditors.length && debtors.length) {
    // Pop the largest from each side
    const creditor = creditors.pop();
    const debtor   = debtors.pop();

    const transfer = Math.min(creditor.amount, debtor.amount);
    const rounded  = Math.round(transfer * 100) / 100;

    if (rounded > 0) {
      transactions.push({ from: debtor.userId, to: creditor.userId, amount: rounded });
    }

    // Re-insert any leftover balance
    const credRem = creditor.amount - transfer;
    const debtRem = debtor.amount  - transfer;
    if (credRem > EPSILON) insertSorted(creditors, { userId: creditor.userId, amount: credRem });
    if (debtRem > EPSILON) insertSorted(debtors,   { userId: debtor.userId,   amount: debtRem });
  }

  return transactions;
}

/**
 * Compute the simplified (minimum-transaction) debt list for a group.
 *
 * Returns:
 *   transactions: Array<{ from: UserInfo, to: UserInfo, amount: number }>
 *   totalTransactions: number   — how many transfers are needed
 *   savedTransactions: number   — how many the naive approach would need minus this
 */
export const getSimplifiedDebts = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await ctx.runQuery(internal.users.getCurrentUser);

    // ── 1. Auth ────────────────────────────────────────────────────────────
    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");

    if (!group.members.some((m) => m.userId === me._id)) {
      throw new Error("You are not a member of this group");
    }

    // ── 2. Fetch data (indexes exist in schema.js ✓) ───────────────────────
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    // ── 3. Build net-balance map ───────────────────────────────────────────
    //   balance[uid] > 0  →  group owes them
    //   balance[uid] < 0  →  they owe the group
    const balance = {};
    const add = (uid, n) => { balance[uid] = (balance[uid] ?? 0) + n; };

    // Initialise every member so people with zero net still appear if needed
    for (const m of group.members) add(m.userId, 0);

    for (const exp of expenses) {
      for (const split of exp.splits) {
        if (split.paid) continue;                      // already settled
        if (split.userId === exp.paidByUserId) continue; // payer's own share

        add(exp.paidByUserId, +split.amount); // payer is owed
        add(split.userId,     -split.amount); // participant owes
      }
    }

    for (const s of settlements) {
      // A settlement records: paidByUserId handed cash to receivedByUserId
      // That reduces paidByUserId's debt (or increases their credit)
      // and reduces receivedByUserId's credit.
      add(s.paidByUserId,     +s.amount);
      add(s.receivedByUserId, -s.amount);
    }

    // ── 4. Run min-cash-flow ───────────────────────────────────────────────
    const simplified = minCashFlow(balance);

    // ── 5. Hydrate user info ───────────────────────────────────────────────
    const memberIds = [...new Set(simplified.flatMap((t) => [t.from, t.to]))];
    const userMap = {};
    await Promise.all(
      memberIds.map(async (uid) => {
        const u = await ctx.db.get(uid);
        if (u) {
          userMap[uid] = {
            id: u._id,
            name: u.name,
            email: u.email,
            imageUrl: u.imageUrl ?? null,
          };
        }
      })
    );

    const transactions = simplified.map((t) => ({
      from: userMap[t.from],   // who pays
      to:   userMap[t.to],     // who receives
      amount: t.amount,
    }));

    // Naive pairwise count: one transfer per directed debt edge
    // (same logic getGroupExpenses uses before netting)
    const naiveCount = Object.values(balance).filter((b) => b < -0.005).length;

    return {
      transactions,                                              // simplified list
      totalTransactions: transactions.length,                    // after simplification
      savedTransactions: Math.max(0, naiveCount - transactions.length), // transfers saved
    };
  },
});