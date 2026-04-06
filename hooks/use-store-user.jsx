"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

export function useStoreUser() {  // 👈 named export, no "default"
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const [userId, setUserId] = useState(null);
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    console.log("🔄 Auth state:", { isLoading, isAuthenticated });
    if (!isAuthenticated) return;

    async function createUser() {
      try {
        console.log("📡 Calling storeUser mutation...");
        const id = await storeUser();
        console.log("✅ storeUser returned:", id);
        setUserId(id);
      } catch (err) {
        console.error("❌ storeUser failed:", err);
      }
    }

    createUser();
    return () => setUserId(null);
  }, [isAuthenticated, storeUser, user?.id]);

  return {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}