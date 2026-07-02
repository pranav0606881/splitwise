"use client";

import { api } from "@/convex/_generated/api";
import { useConvexQuery } from "@/hooks/use-convex-query";

export function useCurrentUser() {
  const { data, isLoading, error } = useConvexQuery(api.users.getCurrentUser);

  return {
    user: data,
    isLoading,
    error,
  };
}
