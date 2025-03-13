import { CogIcon } from "@heroicons/react/24/outline";
import React from "react";
import { openSettingsMenu } from "@/lib/features/settingsMenuSlice";
import { useAppDispatch } from "@/lib/hooks";

type SettingsButtonProps = {
  className?: string;
};

const SettingsButton: React.FC<SettingsButtonProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  return (
    <div
      className={`${className} bg-zinc-500 rounded-lg shadow-xs content-center transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:shadow-xs cursor-pointer`}
      onClick={() => {
        dispatch(openSettingsMenu());
      }}
    >
      {/* <!-- Settings --> */}
      <div className="grid grid-cols-3 w-full h-18">
        {/* <!-- Gear icon --> */}
        <div className="content-center">
          <CogIcon className="m-4 fill-zinc-100 hover:fill-zinc-200 size-10" />
        </div>
        {/* <!-- Settings text --> */}
        <div
          className={`text-4xl text-center text-zinc-100 m-2
            place-self-center`}
        >
          Settings
        </div>
      </div>
    </div>
  );
};

export default SettingsButton;
