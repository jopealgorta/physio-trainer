"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyPinAction, type PinFormState } from "@/server/patient/actions";

/** Asks for the link's 4-digit PIN. The code is bound server-side; the form only sends the PIN. */
export function PinGate({ code, clinicName }: { code: string; clinicName: string }) {
  const t = useTranslations("Patient.pin");
  const id = useId();
  const [state, action, pending] = useActionState<PinFormState, FormData>(
    verifyPinAction.bind(null, code),
    { status: "idle" },
  );
  const error = state.status === "wrong" ? "wrong" : state.status === "invalid" ? "invalid" : null;

  return (
    <form action={action} className="mx-auto grid w-full max-w-sm gap-4 py-8">
      <div className="grid justify-items-center gap-2 text-center">
        <span className="bg-muted flex size-12 items-center justify-center rounded-full">
          <LockIcon aria-hidden className="size-5" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description", { clinic: clinicName })}</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{t("label")}</Label>
        <Input
          id={id}
          name="pin"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
          autoFocus
          required
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="text-center font-mono text-lg tracking-[0.5em]"
        />
      </div>
      {error ? (
        <Alert variant="destructive" id={`${id}-error`}>
          <AlertDescription>{t(error)}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
