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
          <div className="flex flex-col mt-4">
            <Button className="p-2 border border-gray-400 rounded-lg">
              Import
            </Button>
            <Button className="p-2 border border-gray-400 rounded-lg mt-2">
              Export
            </Button>
          </div>
          <Button
            className="mt-4 p-2 border border-gray-400 rounded-lg"
            onClick={closeSettings()}
          >
            Close
          </Button>
        </div>
      </div>
    </>
  );
};
