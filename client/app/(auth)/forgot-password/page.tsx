"use client";

import { useContext, useState, useTransition } from "react";
import { z } from "zod";
import Form from "~/app/components/form/Form.tsx";
import FormTextInput from "~/app/components/form/FormTextInput.tsx";
import { authClient } from "~/helpers/auth-client.ts";
import { HAS_CREDENTIAL_AUTH } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";

function RequestPasswordResetPage() {
  const { changeErrorMessages, changeSuccessMessage } = useContext(MainContext);

  const [email, setEmail] = useState("");
  const [isDisabled, setIsDisabled] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!HAS_CREDENTIAL_AUTH) return <p className="text-center">EMAIL + PASSWORD AUTHENTICATION IS NOT SUPPORTED</p>;

  const handleSubmit = () => {
    const parsed = z.email().safeParse(email);

    if (!parsed.success) {
      changeErrorMessages(["Please enter a valid email address"]);
      document.getElementById("email")?.focus();
    } else {
      startTransition(async () => {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });

        if (error) {
          changeErrorMessages([error.message || error.statusText]);
        } else {
          changeSuccessMessage(
            "A password reset link will be sent to your email if the entered email address is correct",
          );
          setIsDisabled(true);
        }
      });
    }
  };

  return (
    <section>
      <h2 className="mb-5 text-center">Forgot Password</h2>

      <Form onSubmit={handleSubmit} disableControls={isDisabled} isLoading={isPending}>
        <p className="mb-4">
          Enter the email address tied to your account and click submit to request a password reset link.
        </p>

        <FormTextInput
          id="email"
          title="Email address"
          value={email}
          setValue={setEmail}
          nextFocusTargetId="form_submit_button"
          autoFocus
        />
      </Form>
    </section>
  );
}

export default RequestPasswordResetPage;
