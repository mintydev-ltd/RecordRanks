"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useContext, useEffect, useState, useTransition } from "react";
import Button from "~/app/components/UI/Button.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { authClient } from "~/helpers/auth-client.ts";
import { HAS_CREDENTIAL_AUTH } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";

function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const [isDisabled, setIsDisabled] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get("error") || !searchParams.get("token")) {
      changeErrorMessages(["An unknown error has occurred. Please try to reset your password again."]);
    } else {
      setIsDisabled(false);
    }
  }, [searchParams]);

  if (!HAS_CREDENTIAL_AUTH) return <p className="text-center">EMAIL + PASSWORD AUTHENTICATION IS NOT SUPPORTED</p>;

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    const password = formData.get("password");
    const passwordRepeat = formData.get("passwordRepeat");
    if (password !== passwordRepeat) {
      changeErrorMessages(["The passwords do not match"]);
      return;
    }

    startTransition(async () => {
      resetMessages();
      const { error } = await authClient.resetPassword({
        newPassword: password as string,
        token: searchParams.get("token")!,
      });

      if (error) {
        changeErrorMessages([error.message || error.statusText]);
      } else {
        changeSuccessMessage("Your password has been successfully reset");
        setIsDisabled(true);

        setTimeout(() => router.push("/login"), 2000);
      }
    });
  };

  return (
    <section>
      <h2 className="mx-3 mb-4 text-center">Reset Password</h2>

      <ToastMessages />

      <form
        onSubmit={handleSubmit}
        className="container mx-auto my-4 tw:px-4"
        style={{ maxWidth: "var(--rr-md-width)" }}
      >
        <fieldset className="mb-2">
          <label htmlFor="password" className="form-label fw-semibold">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            disabled={isDisabled || isPending}
            className="form-control"
          />
        </fieldset>
        <fieldset className="mb-2">
          <label htmlFor="passwordRepeat" className="form-label fw-semibold">
            Repeat password
          </label>
          <input
            id="passwordRepeat"
            name="passwordRepeat"
            type="password"
            required
            disabled={isDisabled || isPending}
            className="form-control"
          />
        </fieldset>
        <Button type="submit" isLoading={isPending} disabled={isDisabled || isPending} className="mt-3 w-100">
          Reset password
        </Button>
      </form>
    </section>
  );
}

export default ResetPasswordPage;
