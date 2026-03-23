"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getSessionToken } from "../lib/session";

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router, pathname]);

  if (!ready) {
    return (
      <div className="page-frame">
        <div className="section-card">
          <div className="section-card__body">
            <p className="eyebrow">Auth</p>
            <p className="muted-copy">Checking session...</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
