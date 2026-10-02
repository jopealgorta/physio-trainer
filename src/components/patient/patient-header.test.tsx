import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stubImageLoading } from "@/test/image";

import { PatientHeader } from "./patient-header";

const PHOTO = "https://lh3.googleusercontent.com/a/maria=s96-c";
const LOGO = "https://example.supabase.co/storage/v1/object/public/branding/p/logo.png";

function renderHeader({
  clinicName = "Maria Lopez",
  logoUrl = null,
  avatarUrl = null,
}: {
  clinicName?: string;
  logoUrl?: string | null;
  avatarUrl?: string | null;
}) {
  render(
    <PatientHeader
      clinicName={clinicName}
      logoUrl={logoUrl}
      physio={{ name: "Maria Lopez", avatarUrl }}
      photoAlt="Photo of Maria Lopez"
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PatientHeader", () => {
  it("shows the physio's photo beside their name when they are the clinic", async () => {
    stubImageLoading();
    renderHeader({ avatarUrl: PHOTO });
    const photo = await screen.findByRole("img", { name: "Photo of Maria Lopez" });
    expect(photo).toHaveAttribute("src", PHOTO);
    expect(photo).toHaveAttribute("referrerpolicy", "no-referrer");
    // The name appears once: the photo replaces the initial rather than adding a second mark.
    expect(screen.getAllByText("Maria Lopez")).toHaveLength(1);
  });

  it("keeps the initial when there is no photo", () => {
    renderHeader({});
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("falls back to the initial when the photo fails to load", async () => {
    stubImageLoading(() => true);
    renderHeader({ avatarUrl: PHOTO });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("adds the physio beside a clinic with its own name and logo", async () => {
    stubImageLoading();
    renderHeader({ clinicName: "Kine Sur", logoUrl: LOGO, avatarUrl: PHOTO });
    expect(screen.getByText("Kine Sur")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Photo of Maria Lopez" })).toBeInTheDocument();
    expect(screen.getByText("Maria Lopez")).toBeInTheDocument();
  });

  // No clinic name of their own: the clinic name shown is already the physio's.
  it("adds only the photo beside a logo when the clinic name is the physio's", async () => {
    stubImageLoading();
    renderHeader({ logoUrl: LOGO, avatarUrl: PHOTO });
    expect(await screen.findByRole("img", { name: "Photo of Maria Lopez" })).toBeInTheDocument();
    expect(screen.getAllByText("Maria Lopez")).toHaveLength(1);
  });

  it("shows only the clinic when a clinic physio has no photo", () => {
    renderHeader({ clinicName: "Kine Sur", logoUrl: LOGO });
    expect(screen.getByText("Kine Sur")).toBeInTheDocument();
    expect(screen.queryByText("Maria Lopez")).toBeNull();
  });
});
