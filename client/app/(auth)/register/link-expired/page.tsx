"use client";

import { useSearchParams } from "next/navigation";
import { useContext, useEffect, useState, useTransition } from "react";
import { z } from "zod";
import Button from "~/app/components/UI/Button.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { authClient } from "~/helpers/auth-client.ts";
import { HAS_CREDENTIAL_AUTH } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { useSession } from "~/helpers/hooks.ts";

function VerificationLinkExpiredPage() {
  const searchParams = useSearchParams();
  const { changeSuccessMessage, changeErrorMessages } = useContext(MainContext);
  const { user } = useSession();

  const [isDisabled, setIsDisabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const parsed = z.email().safeParse(searchParams.get("email"));

    if (!parsed.success) {
      changeErrorMessages(["An unknown error has occurred. Please try to register again."]);
      setIsDisabled(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isDisabled && user?.emailVerified) {
      changeErrorMessages(["Your email is already verified"]);
      setIsDisabled(true);
    }
  }, [user]);

  if (!HAS_CREDENTIAL_AUTH) return <p className="text-center">EMAIL & PASSWORD AUTHENTICATION IS NOT SUPPORTED</p>;

  const resendVerificationLink = () => {
    startTransition(async () => {
      const email = searchParams.get("email")!;
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `/login?email=${email}`, // same as on the register page
      });

      if (error) {
        changeErrorMessages([error.message || error.statusText]);
      } else {
        changeSuccessMessage("A new verification link has been sent to your email");
        setIsDisabled(true);
      }
    });
  };

  return (
    <section className="px-3">
      <h2 className="mb-4 text-center">Verification Link Expired</h2>

      <ToastMessages className="mb-4" />

      <p className="mb-4 text-center">
        The verification link has expired or isn't valid. Click the button below to send a new verification link to your
        email.
      </p>

      <Button onClick={resendVerificationLink} isLoading={isPending} disabled={isDisabled} className="d-block mx-auto">
        Resend Verification Link
      </Button>
    </section>
  );
}

export default VerificationLinkExpiredPage;
