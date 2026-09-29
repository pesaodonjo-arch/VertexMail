"use client";

import { Button } from "@/components/ui/Button";
import { signOutCurrentAccount } from "@/lib/accounts";

// Signs out the CURRENT account. If other accounts are saved on this device,
// you land in the next one instead of the login page.
export function SignOutButton() {
  return (
    <Button variant="secondary" className="w-full" onClick={() => signOutCurrentAccount()}>
      Sign out
    </Button>
  );
}
