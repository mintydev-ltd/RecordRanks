"use client";

import Link from "next/link";
import { useContext, useState, useTransition } from "react";
import useSWR from "swr";
import z from "zod";
import CommunicationsCheckbox from "~/app/(auth)/CommunicationsCheckbox.tsx";
import Captcha from "~/app/components/Captcha.tsx";
import Button from "~/app/components/UI/Button.tsx";
import ToastMessages from "~/app/components/UI/ToastMessages.tsx";
import { authClient } from "~/helpers/auth-client.ts";
import { HAS_CREDENTIAL_AUTH } from "~/helpers/constants.ts";
import { MainContext } from "~/helpers/contexts.ts";
import { SwrKey } from "~/helpers/swr-keys.ts";
import { getPrivacyPolicySF } from "~/server/server-functions/server-functions.ts";

function RegisterPage() {
  const { changeErrorMessages, changeSuccessMessage, resetMessages } = useContext(MainContext);

  const { data: privacyPolicy, isLoading: isLoadingPrivacyPolicy } = useSWR(SwrKey.PrivacyPolicy, () =>
    getPrivacyPolicySF(),
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const isPending = isSubmitting || isLoadingPrivacyPolicy;

  if (!HAS_CREDENTIAL_AUTH) return <p className="text-center">EMAIL + PASSWORD AUTHENTICATION IS NOT SUPPORTED</p>;

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    if (privacyPolicy?.data && formData.get("privacyPolicy") !== "on") {
      changeErrorMessages(["Please read and accept the Privacy Policy to continue"]);
      return;
    }

    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password");
    const passwordRepeat = formData.get("passwordRepeat");

    if (password !== passwordRepeat) {
      changeErrorMessages(["The passwords do not match"]);
      return;
    }

    startTransition(async () => {
      resetMessages();
      const { error } = await authClient.signUp.email({
        username,
        email,
        password: password as string,
        name: username,
        communicationsAgreed: formData.get("communicationsAgreed") === "on",
        callbackURL: `/login?email=${email}`, // same as on the link-expired page
        fetchOptions: {
          headers: {
            "x-captcha-verification-token": formData.get("tcVerificationToken"),
          },
        },
      });

      if (error) {
        changeErrorMessages([error.message || error.statusText]);
      } else {
        changeSuccessMessage(
          "A verification link has been sent to your email. Please click the link in the email to finish your registration.",
        );
        setIsSubmitted(true);
        await authClient.signOut();
      }
    });
  };

  return (
    <section>
      <h2 className="mb-4 text-center">Register</h2>

      <ToastMessages />

      <form
        onSubmit={handleSubmit}
        className="container mx-auto my-4 tw:px-4"
        style={{ maxWidth: "var(--rr-md-width)" }}
      >
        <fieldset className="mb-2">
          <label htmlFor="username" className="form-label fw-semibold">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            required
            // biome-ignore lint/a11y/noAutofocus: meh
            autoFocus
            disabled={isSubmitted || isPending}
            className="form-control"
          />
        </fieldset>
        <fieldset className="mb-2">
          <label htmlFor="email" className="form-label fw-semibold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isSubmitted || isPending}
            className="form-control"
          />
        </fieldset>
        <fieldset className="mb-2">
          <label htmlFor="password" className="form-label fw-semibold">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            disabled={isSubmitted || isPending}
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
            disabled={isSubmitted || isPending}
            className="form-control"
          />
        </fieldset>
        {privacyPolicy?.data && (
          <div className="d-flex column-gap-2 mt-3 flex-wrap">
            <div className="form-check">
              <input
                id="privacy_policy_checkbox"
                type="checkbox"
                name="privacyPolicy"
                disabled={isSubmitted || isPending}
                className="form-check-input"
              />
              <label className="form-check-label ms-1" htmlFor="privacy_policy_checkbox">
                I have read and accept the
              </label>
            </div>
            {z.url().safeParse(privacyPolicy.data).success ? (
              <a href={privacyPolicy.data} target="_blank" rel="noopener">
                Privacy Policy
              </a>
            ) : (
              <Link href="/privacy" target="_blank" prefetch={false}>
                Privacy Policy
              </Link>
            )}
          </div>
        )}
        <CommunicationsCheckbox disabled={isSubmitted || isPending} className="my-3" />
        <Captcha />
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitted || isPending} className="mt-3 w-100">
          Register
        </Button>
      </form>

      <div className="fs-5 container mx-auto my-4 px-3" style={{ maxWidth: "var(--rr-md-width)" }}>
        <Link href="/login" prefetch={false}>
          Log in
        </Link>
      </div>
    </section>
  );
}

export default RegisterPage;
