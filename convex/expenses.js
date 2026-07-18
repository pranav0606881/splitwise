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
// SIMPLIFY DEBTS  —  Splitwise algorithm via Dinic's Max-Flow
// ─────────────────────────────────────────────────────────────────────────────
//
// Reference: https://medium.com/@mithunmk93/algorithm-behind-splitwises-debt-simplification-feature-8ac485e97688
//
// WHY MAX-FLOW instead of greedy min-cash-flow?
// ─────────────────────────────────────────────
// The greedy approach can introduce NEW debt relationships
// (e.g. "Alice pays Carol" even if they never shared an expense).
// Splitwise's Rule 2 says: "No one owes a person they didn't owe before."
//
// The max-flow approach only modifies WEIGHTS on EXISTING edges.
// It never introduces a new creditor-debtor relationship.
//
// ALGORITHM (per article):
// ─────────────────────────
// 1. Build directed debt graph from all expenses & settlements.
// 2. For each existing edge (u → v):
//    a. Run Dinic's max-flow from u to v through the ENTIRE current graph.
//    b. The max-flow value = maximised debt on edge (u → v).
//    c. Record edge (u, v, max-flow) in result.
//    d. Replace current graph with the residual graph (remaining capacities).
// 3. Final result = simplified edge list with minimum redundant transactions.
//
// COMPLEXITY: O(V² · E²)  —  negligible for group sizes in practice.
// ─────────────────────────────────────────────────────────────────────────────

const EPSILON = 0.005; // ignore sub-half-cent floating-point noise

/**
 * Run Dinic's max-flow on `graph` from source `s` to sink `t`.
 * Mutates graph capacities in place (standard Dinic's behaviour).
 * Returns the total flow value.
 *
 * @param {Array<Array<{to:number, cap:number, rev:number}>>} graph
 * @param {number} n   number of nodes
 * @param {number} s   source node index
 * @param {number} t   sink node index
 * @returns {number}
 */
function dinic(graph, n, s, t) {
  // BFS: build level graph, return true if sink is reachable
  const bfs = (level) => {
    level.fill(-1);
    level[s] = 0;
    const q = [s];
    for (let qi = 0; qi < q.length; qi++) {
      const v = q[qi];
      for (const e of graph[v]) {
        if (e.cap > EPSILON && level[e.to] < 0) {
          level[e.to] = level[v] + 1;
          q.push(e.to);
        }
      }
    }
    return level[t] >= 0;
  };

  // DFS: send blocking flow along level graph
  const dfs = (v, pushed, level, iter) => {
    if (v === t) return pushed;
    for (; iter[v] < graph[v].length; iter[v]++) {
      const e = graph[v][iter[v]];
      if (e.cap > EPSILON && level[e.to] === level[v] + 1) {
        const d = dfs(e.to, Math.min(pushed, e.cap), level, iter);
        if (d > EPSILON) {
          e.cap -= d;
          graph[e.to][e.rev].cap += d;
          return d;
        }
      }
    }
    return 0;
  };

  const level = new Array(n);
  let flow = 0;
  while (bfs(level)) {
    const iter = new Array(n).fill(0);
    let f;
    while ((f = dfs(s, Infinity, level, iter)) > EPSILON) flow += f;
  }
  return flow;
}

/**
 * Splitwise-style debt simplification using Dinic's Max-Flow.
 *
 * @param {{ from: string, to: string, amount: number }[]} rawDebts
 *   One entry per (debtor → creditor) relationship.
 *   Duplicates are summed; settlements are passed as reverse debts.
 *
 * @returns {{ from: string, to: string, amount: number }[]}
 *   Simplified edge list — only existing relationships, weights maximised.
 */
function simplifyDebtsMaxFlow(rawDebts) {
  if (!rawDebts.length) return [];

  // ── 1. Build node index ───────────────────────────────────────────────────
  const userSet = new Set();
  rawDebts.forEach(({ from, to }) => { userSet.add(from); userSet.add(to); });
  const users = [...userSet];
  const idx = Object.fromEntries(users.map((u, i) => [u, i]));
  const n = users.length;

  // ── 2. Build net debt matrix  debt[i][j] = i owes j ─────────────────────
  const debt = Array.from({ length: n }, () => new Array(n).fill(0));
  rawDebts.forEach(({ from, to, amount }) => {
    debt[idx[from]][idx[to]] += amount;
  });

  // Net opposing debts between each pair (A owes B $10, B owes A $7 → A owes B $3)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const net = debt[i][j] - debt[j][i];
      debt[i][j] = net > 0 ? net : 0;
      debt[j][i] = net < 0 ? -net : 0;
    }
  }

  // ── 3. Record original edges (before any flow is run) ────────────────────
  const originalEdges = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (debt[i][j] > EPSILON) originalEdges.push([i, j]);

  // ── 4. Main loop: maximise flow on each original edge ────────────────────
  let current = debt.map((r) => [...r]); // working copy — updated after each max-flow run
  const result = [];

  for (const [u, v] of originalEdges) {
    if (current[u][v] <= EPSILON) continue; // already consumed by a previous flow

    // Build a fresh Dinic's graph from the current debt matrix.
    // We track forward-edge references so we can read residual capacities afterwards.
    const graph = Array.from({ length: n }, () => []);
    const fwdRefs = []; // { from, to, nodeIdx, edgeIdx }

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (current[i][j] > EPSILON) {
          const fwdIdx = graph[i].length;
          const revIdx = graph[j].length;
          graph[i].push({ to: j, cap: current[i][j], rev: revIdx });
          graph[j].push({ to: i, cap: 0,              rev: fwdIdx });
          fwdRefs.push({ from: i, to: j, nodeIdx: i, edgeIdx: fwdIdx });
        }
      }
    }

    // Run Dinic's from u → v on the full graph (uses ALL paths, not just direct edge)
    const flow = dinic(graph, n, u, v);

    if (flow > EPSILON) {
      result.push({ from: u, to: v, amount: Math.round(flow * 100) / 100 });

      // Rebuild current debt matrix from residual forward-edge capacities
      const next = Array.from({ length: n }, () => new Array(n).fill(0));
      for (const { from, to, nodeIdx, edgeIdx } of fwdRefs) {
        const remaining = graph[nodeIdx][edgeIdx].cap;
        if (remaining > EPSILON) next[from][to] = remaining;
      }
      current = next;
    }
  }

  // ── 5. Map node indices back to user IDs ─────────────────────────────────
  return result.map(({ from, to, amount }) => ({
    from: users[from],
    to: users[to],
    amount,
  }));
}

// ─── getSimplifiedDebts query ─────────────────────────────────────────────────
export const getSimplifiedDebts = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    const me = await ctx.runQuery(internal.users.getCurrentUser);

    // ── Auth ─────────────────────────────────────────────────────────────────
    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");
    if (!group.members.some((m) => m.userId === me._id))
      throw new Error("You are not a member of this group");

    // ── Fetch data ────────────────────────────────────────────────────────────
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    const settlements = await ctx.db
      .query("settlements")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect();

    // ── Build raw debt list ───────────────────────────────────────────────────
    // Each unpaid expense split  →  debtor owes payer
    // Each settlement            →  modelled as reverse debt (reduces original)
    const rawDebts = [];

    for (const exp of expenses) {
      for (const split of exp.splits) {
        if (split.paid) continue;
        if (split.userId === exp.paidByUserId) continue; // payer's own share
        rawDebts.push({
          from: split.userId,      // debtor
          to: exp.paidByUserId,    // creditor (payer)
          amount: split.amount,
        });
      }
    }

    for (const s of settlements) {
      // paidByUserId already paid receivedByUserId →
      // model as receivedByUserId owing paidByUserId back (reduces net debt)
      rawDebts.push({
        from: s.receivedByUserId,
        to: s.paidByUserId,
        amount: s.amount,
      });
    }

    // ── Run Splitwise max-flow algorithm ──────────────────────────────────────
    const simplified = simplifyDebtsMaxFlow(rawDebts);

    if (!simplified.length) return { transactions: [], totalTransactions: 0, savedTransactions: 0 };

    // ── Hydrate user info ─────────────────────────────────────────────────────
    const allUserIds = [...new Set(simplified.flatMap(({ from, to }) => [from, to]))];
    const userMap = {};
    await Promise.all(
      allUserIds.map(async (uid) => {
        const u = await ctx.db.get(uid);
        if (u) userMap[uid] = { id: u._id, name: u.name, email: u.email, imageUrl: u.imageUrl ?? null };
      })
    );

    const transactions = simplified.map(({ from, to, amount }) => ({
      from: userMap[from],
      to:   userMap[to],
      amount,
    }));

    return {
      transactions,
      totalTransactions: transactions.length,
      savedTransactions: Math.max(0, rawDebts.length - transactions.length),
    };
  },
});