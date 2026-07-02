"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useConvexQuery, useConvexMutation } from "@/hooks/use-convex-query";
import { BarLoader } from "react-spinners";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PlusCircle,
  ArrowLeftRight,
  ArrowLeft,
  Users,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { ExpenseList } from "@/components/expense-list";
import { SettlementList } from "@/components/settlement-list";
import { GroupBalances } from "@/components/group-balances";
import { GroupMembers } from "@/components/group-members";
import { toast } from "sonner";

// ─── Simplify Debts Modal ─────────────────────────────────────────────────────

function SimplifyDebtsModal({ open, onClose, groupId }) {
  const [settlingIndex, setSettlingIndex] = useState(null);
  const [settledIndexes, setSettledIndexes] = useState(new Set());

  const { data: simplifyData, isLoading: simplifyLoading } = useConvexQuery(
    api.expenses.getSimplifiedDebts,
    open ? { groupId } : "skip"
  );

  // ✅ No more useCurrentUser — use the query that exists in your users.js
  const { data: currentUser } = useConvexQuery(api.users.getCurrentUserPublic);

  const { mutate: createSettlement } = useConvexMutation(api.settlements.createSettlement);

  const handleSettle = async (transaction, index) => {
    setSettlingIndex(index);
    try {
      await createSettlement({
        paidByUserId: transaction.from.id,
        receivedByUserId: transaction.to.id,
        amount: transaction.amount,
        groupId,
        note: "Simplified debt settlement",
      });

      setSettledIndexes((prev) => new Set([...prev, index]));
      toast.success(
        "Settled ₹" + transaction.amount.toFixed(2) + " with " + transaction.to.name
      );
    } catch (err) {
      toast.error("Failed to record settlement");
      console.error(err);
    } finally {
      setSettlingIndex(null);
    }
  };

  const handleClose = () => {
    setSettledIndexes(new Set());
    onClose();
  };

  const transactions = simplifyData?.transactions ?? [];
  const saved = simplifyData?.savedTransactions ?? 0;
console.log("currentUser._id:", currentUser?._id);
console.log("transaction.from.id:", transactions[0]?.from?.id);
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Simplified Debts
          </DialogTitle>
          <DialogDescription>
            Minimum transactions needed to settle all balances in this group.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {simplifyLoading && (
          <div className="py-8 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Computing simplified debts…</p>
          </div>
        )}

        {/* All settled */}
        {!simplifyLoading && transactions.length === 0 && (
          <div className="py-10 flex flex-col items-center gap-3">
            <div className="bg-green-500/10 p-4 rounded-full">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <p className="font-medium text-center">All settled up!</p>
            <p className="text-sm text-muted-foreground text-center">
              No outstanding debts in this group.
            </p>
          </div>
        )}

        {/* Transaction list */}
        {!simplifyLoading && transactions.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {transactions.length} transaction
                {transactions.length !== 1 ? "s" : ""} needed
              </span>
              {saved > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Sparkles className="h-3 w-3" />
                  {saved} saved
                </Badge>
              )}
            </div>

            {transactions.map((t, i) => {
              const isSettled = settledIndexes.has(i);
              const isSettling = settlingIndex === i;
              // ✅ _id comparison — both are Convex string IDs
              const isMyDebt = currentUser?._id === t.from.id;
              const canSettle = isMyDebt && !isSettled;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    isSettled
                      ? "bg-green-500/5 border-green-500/20 opacity-60"
                      : isMyDebt
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card border-border"
                  }`}
                >
                  {/* From */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={t.from.imageUrl} />
                      <AvatarFallback className="text-xs">
                        {t.from.name?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium truncate">
                      {isMyDebt ? "You" : t.from.name}
                    </span>
                  </div>

                  {/* Amount + arrow */}
                  <div className="flex flex-col items-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      ₹{t.amount.toFixed(2)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* To */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                    <span className="text-sm font-medium truncate">
                      {currentUser?._id === t.to.id ? "You" : t.to.name}
                    </span>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={t.to.imageUrl} />
                      <AvatarFallback className="text-xs">
                        {t.to.name?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Settle button */}
                  {isSettled ? (
                    <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                  ) : (
                    <Button
                      size="sm"
                      variant={canSettle ? "default" : "outline"}
                      disabled={!canSettle || isSettling}
                      onClick={() => handleSettle(t, i)}
                      className="shrink-0 ml-1"
                    >
                      {isSettling ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : canSettle ? (
                        "Settle"
                      ) : (
                        "Not yours"
                      )}
                    </Button>
                  )}
                </div>
              );
            })}

            <p className="text-xs text-muted-foreground text-center pt-1">
              Highlighted rows are your debts. Only you can settle your own.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GroupExpensesPage() {
  const params = useParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("expenses");
  const [showSimplify, setShowSimplify] = useState(false);

  const { data, isLoading } = useConvexQuery(api.groups.getGroupExpenses, {
    groupId: params.id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-12">
        <BarLoader width={"100%"} color="#36d7b7" />
      </div>
    );
  }

  const group = data?.group;
  const members = data?.members || [];
  const expenses = data?.expenses || [];
  const settlements = data?.settlements || [];
  const balances = data?.balances || [];
  const userLookupMap = data?.userLookupMap || {};

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          className="mb-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-4 rounded-md">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl gradient-title">{group?.name}</h1>
              <p className="text-muted-foreground">{group?.description}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {members.length} members
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowSimplify(true)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Simplify Debts
            </Button>

            <Button asChild variant="outline">
              <Link href={`/settlements/group/${params.id}`}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Settle up
              </Link>
            </Button>

            <Button asChild>
              <Link href={`/expenses/new`}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add expense
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Group Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupBalances balances={balances} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Members</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupMembers members={members} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs
        defaultValue="expenses"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="expenses">
            Expenses ({expenses.length})
          </TabsTrigger>
          <TabsTrigger value="settlements">
            Settlements ({settlements.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <ExpenseList
            expenses={expenses}
            showOtherPerson={true}
            isGroupExpense={true}
            userLookupMap={userLookupMap}
          />
        </TabsContent>

        <TabsContent value="settlements" className="space-y-4">
          <SettlementList
            settlements={settlements}
            isGroupSettlement={true}
            userLookupMap={userLookupMap}
          />
        </TabsContent>
      </Tabs>

      <SimplifyDebtsModal
        open={showSimplify}
        onClose={() => setShowSimplify(false)}
        groupId={params.id}
      />
    </div>
  );
}