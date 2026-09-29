import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import type { CustomerFormState } from "@/server/customers/schemas";

import messages from "../../../messages/en.json";

import { CustomerForm, type CustomerFormValues } from "./customer-form";

const defaults: CustomerFormValues = {
  firstName: "",
  lastName: null,
  email: null,
  phone: null,
  dateOfBirth: null,
  sex: null,
  occupation: null,
  activity: null,
  medicalHistory: null,
  locale: "en",
};

function setup(
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>,
  values: Partial<CustomerFormValues> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <CustomerForm action={action} defaults={{ ...defaults, ...values }} />
    </NextIntlClientProvider>,
  );
}

const idleAction = () => vi.fn(async (): Promise<CustomerFormState> => ({ status: "idle" }));
const detailsOf = () => screen.getByText("More details").closest("details") as HTMLDetailsElement;

describe("CustomerForm", () => {
  it("renders labelled fields with a required first name", () => {
    setup(idleAction());
    expect(screen.getByLabelText("First name")).toBeRequired();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveAccessibleDescription(
      "Include the country code (+598…) to enable WhatsApp.",
    );
    expect(screen.getByLabelText("Date of birth")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Sex")).toBeInTheDocument();
    expect(screen.getByLabelText("Occupation")).toBeInTheDocument();
    expect(screen.getByLabelText("Sport / activity")).toBeInTheDocument();
    expect(screen.getByLabelText("Medical history")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create customer" })).toBeInTheDocument();
  });

  it("offers Save changes and a hidden id only when editing", () => {
    const { unmount } = setup(idleAction());
    expect(document.querySelector('input[name="id"]')).toBeNull();
    unmount();
    setup(idleAction(), { id: "abc", firstName: "Ana" });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(document.querySelector('input[name="id"]')).toHaveValue("abc");
    expect(screen.getByLabelText("First name")).toHaveValue("Ana");
  });

  it("keeps More details closed for a new customer without data", () => {
    setup(idleAction());
    expect(detailsOf().open).toBe(false);
  });

  it("opens More details when editing", () => {
    setup(idleAction(), { id: "abc", firstName: "Ana" });
    expect(detailsOf().open).toBe(true);
  });

  it("opens More details when one of its fields has a value", () => {
    setup(idleAction(), { occupation: "Nurse" });
    expect(detailsOf().open).toBe(true);
    expect(screen.getByLabelText("Occupation")).toHaveValue("Nurse");
  });

  it("opens More details when one of its fields has an error", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({
      status: "error",
      fieldErrors: { activity: "tooLong" },
    }));
    setup(action);
    expect(detailsOf().open).toBe(false);
    await user.type(screen.getByLabelText("First name"), "Ana");
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByText("Use at most 200 characters.")).toBeVisible();
    expect(detailsOf().open).toBe(true);
    expect(screen.getByLabelText("Sport / activity")).toHaveAttribute("aria-invalid", "true");
  });

  it("defaults the locale select to the given locale", () => {
    setup(idleAction(), { locale: "es" });
    expect(screen.getByLabelText("Patient language")).toHaveValue("es");
  });

  it("offers a Not set option and every sex", () => {
    setup(idleAction());
    const select = screen.getByLabelText("Sex");
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Not set" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Prefer not to say" })).toBeInTheDocument();
  });

  it("submits the form data to the action", async () => {
    const user = userEvent.setup();
    const action = idleAction();
    setup(action);
    await user.type(screen.getByLabelText("First name"), "Ana");
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("firstName")).toBe("Ana");
    expect(formData.get("email")).toBe("ana@example.com");
    expect(formData.get("locale")).toBe("en");
  });

  it("shows field errors, sets aria-invalid and keeps what was typed", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({
      status: "error",
      fieldErrors: { firstName: "nameRequired", email: "emailInvalid" },
    }));
    setup(action);
    await user.type(screen.getByLabelText("Email"), "nope");
    await user.type(screen.getByLabelText("Last name"), "Pérez");
    await user.click(screen.getByRole("button", { name: "Create customer" }));

    expect(await screen.findByText("Enter a first name.")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("First name")).toHaveAccessibleDescription("Enter a first name.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveValue("nope");
    expect(screen.getByLabelText("Last name")).toHaveValue("Pérez");
  });

  it("interpolates the maximum length in length errors", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({
      status: "error",
      fieldErrors: { firstName: "nameTooLong", phone: "phoneTooLong" },
    }));
    setup(action);
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findAllByText(/^Use at most \d+ characters\.$/)).toHaveLength(2);
    expect(screen.getByText("Use at most 60 characters.")).toBeInTheDocument();
    expect(screen.getByText("Use at most 30 characters.")).toBeInTheDocument();
  });

  it("falls back to a generic message for unknown error codes", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({
      status: "error",
      fieldErrors: { lastName: "weird" },
    }));
    setup(action);
    await user.click(screen.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByText("Check this field.")).toBeInTheDocument();
  });

  it("announces a successful save", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({ status: "saved" }));
    setup(action, { id: "abc", firstName: "Ana" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(screen.getByLabelText("First name")).toHaveValue("Ana");
  });

  it("shows the not-found alert", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<CustomerFormState> => ({
      status: "error",
      fieldErrors: {},
      formError: "notFound",
    }));
    setup(action, { id: "abc", firstName: "Ana" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This customer no longer exists.");
  });
});
