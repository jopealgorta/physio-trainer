import { PhysioAvatar } from "@/components/physio-avatar";

import { ClinicMark } from "./clinic-mark";

/**
 * The clinic header of every patient state. When the physio is the clinic (no logo, no clinic
 * name of their own), their sign-in photo takes the initial's place; otherwise the photo and
 * their name (unless the clinic name shown is already theirs) sit at the end, so patients see
 * who their physio is. No photo, nothing extra.
 */
export function PatientHeader({
  clinicName,
  logoUrl,
  physio,
  photoAlt,
}: {
  clinicName: string;
  logoUrl: string | null;
  physio: { name: string; avatarUrl: string | null };
  photoAlt: string;
}) {
  const physioIsClinic = logoUrl === null && clinicName === physio.name;
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        {physioIsClinic ? (
          <PhysioAvatar
            name={physio.name}
            src={physio.avatarUrl}
            alt={photoAlt}
            className="size-9 text-base"
          />
        ) : (
          <ClinicMark name={clinicName} logoUrl={logoUrl} alt="" className="size-9 text-base" />
        )}
        <p className="min-w-0 flex-1 truncate font-semibold">{clinicName}</p>
        {!physioIsClinic && physio.avatarUrl ? (
          <div className="flex min-w-0 shrink items-center gap-2">
            {/* With a logo but no clinic name of their own, the name is already shown. */}
            {clinicName === physio.name ? null : (
              <span className="text-muted-foreground hidden truncate text-sm sm:inline">
                {physio.name}
              </span>
            )}
            <PhysioAvatar
              name={physio.name}
              src={physio.avatarUrl}
              alt={photoAlt}
              className="size-8"
            />
          </div>
        ) : null}
      </div>
    </header>
  );
}
