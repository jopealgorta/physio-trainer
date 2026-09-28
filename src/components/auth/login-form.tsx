"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LoginError } from "@/lib/auth/login-errors";
import { sendMagicLink, signInWithGoogle } from "@/server/auth/actions";
import type { MagicLinkState } from "@/server/auth/schemas";

const initialState: MagicLinkState = { status: "idle" };

export function LoginForm({
  next,
  googleEnabled,
  error,
}: {
  next: string;
  googleEnabled: boolean;
  error: LoginError | null;
}) {
  const t = useTranslations("Login");
  const tErrors = useTranslations("Auth.errors");
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState);
  // "Use a different email" hides the confirmation until the next successful send.
  const [dismissed, setDismissed] = useState<MagicLinkState | null>(null);

  if (state.status === "sent" && dismissed !== state) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("checkInboxTitle")}</CardTitle>
          <CardDescription>{t("checkInboxDescription", { email: state.email })}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={() => setDismissed(state)}>
            {t("useDifferentEmail")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const formError = state.status === "error" ? state.error : null;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{tErrors(error)}</AlertDescription>
          </Alert>
        ) : null}
        {googleEnabled ? (
          <>
            <form action={signInWithGoogle}>
              <input type="hidden" name="next" value={next} />
              <Button type="submit" variant="outline" className="w-full">
                {t("google")}
              </Button>
            </form>
            <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
              <span className="bg-border h-px flex-1" />
              {t("or")}
              <span className="bg-border h-px flex-1" />
            </div>
          </>
        ) : null}
        <form action={formAction} className="grid gap-3" noValidate>
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder={t("emailPlaceholder")}
              defaultValue={dismissed?.status === "sent" ? dismissed.email : undefined}
              aria-invalid={formError === "emailInvalid"}
              aria-describedby={formError ? "email-error" : undefined}
            />
            {formError ? (
              <p id="email-error" role="alert" className="text-destructive text-sm">
                {tErrors(formError)}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? t("sending") : t("sendLink")}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/">{t("back")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
