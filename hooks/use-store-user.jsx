"use client";
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

export function useStoreUser() {  
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { isLoaded: isUserLoaded, user } = useUser();
  const [userId, setUserId] = useState(null);
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    console.log("🔄 Auth state:", { isLoading, isAuthenticated, isUserLoaded });
    if (!isAuthenticated || !isUserLoaded || !user) return;

    async function createUser() {
      try {
        const preferredEmail =
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          user?.email;

        if (!preferredEmail) {
          console.warn("User email not yet available from Clerk");
          return;
        }

        const name =
          user?.fullName?.trim() ||
          [user?.firstName, user?.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          preferredEmail.split("@")[0] ||
          "Anonymous";
        const email = preferredEmail;
        const imageUrl = user?.imageUrl || user?.profileImageUrl || null;

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
  }, [isAuthenticated, isUserLoaded, storeUser, user]);

  return {
    isLoading: isLoading || !isUserLoaded || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}