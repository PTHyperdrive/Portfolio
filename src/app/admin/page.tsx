"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect legacy /admin to /adminsystemnrsp */
export default function AdminLegacyRedirect() {
    const router = useRouter();
    useEffect(() => { router.replace("/adminsystemnrsp"); }, [router]);
    return null;
}
