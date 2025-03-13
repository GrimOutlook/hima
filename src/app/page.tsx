"use client";
import Alert from "@/app/components/Alert";
import EventForm from "@/app/components/EventForm";
import EventsList from "@/app/components/EventList";
import { Logo } from "@/app/components/Logo";
import PoolForm from "@/app/components/PoolForm";
import PoolList from "@/app/components/PoolList";
import SettingsButton from "@/app/components/SettingsButton";
import { SettingsMenu } from "@/app/components/SettingsMenu";
import TotalHoursCard from "@/app/components/TotalHoursCard";
import { selectHasUnsavedChanges } from "@/lib/features/trackUnsavedChanges";
import { useAppSelector } from "@/lib/hooks";
import { useEffect } from "react";

// eslint-disable-next-line max-lines-per-function
export default function Home() {
  const hasUnsavedChanges = useAppSelector(selectHasUnsavedChanges);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault();
        // Required for some browsers
        event.returnValue = "";
        /* Custom message (doesn't work in modern browsers only a generic
         *  message is shown)
         */
        return "You have unsaved changes. Are you sure you want to leave?";
      }
      return null;
    };

    // eslint-disable-next-line no-undef
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      // eslint-disable-next-line no-undef
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return (
    <>
      <div
        className={`flex flex-row text-gray-700 bg-linear-to-tr
          from-zinc-900 to-zinc-800 w-full max-h-dvh`}
      >
        {/* <!-- Left side --> */}
        <div className="flex flex-col min-w-64 max-w-100 ml-2 mb-2 max-h-dvh">
          <Logo className="self-center w-full max-h-36" />
          {/* <!-- Top box --> */}
          <TotalHoursCard className="mt-2 flex-none" />
          {/* <!-- Middle box --> */}
          <PoolList className="mt-2 grow" />
          {/* <!-- Bottom box --> */}
          <SettingsButton className="mt-2 h-24 w-full" />
        </div>

        {/* <!-- Right side --> */}
        <EventsList className="min-w-48 grow" />
      </div>
      <Alert />
      <PoolForm />
      <EventForm />
      <SettingsMenu />
    </>
  );
}
