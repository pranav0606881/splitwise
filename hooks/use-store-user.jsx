"use client";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

export function useStoreUser() {  
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const [userId, setUserId] = useState(null);
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    console.log("🔄 Auth state:", {isLoading, isAuthenticated});
    if (!isAuthenticated) return;

    async function createUser() {
      try {
        const preferredEmail =
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          user?.email;
        const name =
          user?.fullName?.trim() ||
          [user?.firstName, user?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          (preferredEmail ? preferredEmail.split("@")[0] : null) ||
          "Anonymous";
        const email = preferredEmail || "unknown@clerk.dev";
        const imageUrl = user?.profileImageUrl || user?.imageUrl || null;

        console.log("📡 Calling storeUser mutation with:", {
          authIdentifier: user?.id,
          name,
          email,
          imageUrl,
        });
        const id = await storeUser({
          authIdentifier: user?.id,
          name,
          email,
          imageUrl,
        });
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