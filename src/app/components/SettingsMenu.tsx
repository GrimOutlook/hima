import {
  closeSettingsMenu,
  selectSettingsMenuOpenState,
} from "@/lib/features/settingsMenuSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { Button } from "@headlessui/react";

export const SettingsMenu = () => {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(selectSettingsMenuOpenState);
  const closeSettings = () => () => {
    dispatch(closeSettingsMenu());
  };

  if (!isOpen) {
    return <> </>;
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/30 flex items-center
          justify-center`}
        onClick={closeSettings()}
      >
        <div className="bg-white w-80 p-4 rounded-lg">
          <h1 className="text-2xl font-bold">Settings</h1>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              className={`w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700
                hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out hover:scale-102`}
            >
              Import
            </Button>
            <Button
              className={`w-full rounded-lg p-2 text-3xl bg-black/10 text-zinc-700
                hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out
                hover:scale-102`}
            >
              Export
            </Button>
          </div>
          <Button
            className={`w-full mt-8 rounded-lg p-2 text-3xl bg-black/10 text-zinc-700
              hover:cursor-pointer hover:shadow-lg transition duration-150 ease-in-out
              hover:scale-102`}
          >
            Close
          </Button>
        </div>
      </div>
    </>
  );
};
