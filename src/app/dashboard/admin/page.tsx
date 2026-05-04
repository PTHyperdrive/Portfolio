"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect legacy /dashboard/admin to the new standalone admin route. */
export default function DashboardAdminRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace("/adminsystemnrsp"); }, [router]);
    return null;
}
