// import { Dialog } from '@headlessui/react';

import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";

export default function Home() {
  return (
    <div className="flex flex-row text-gray-700 bg-gradient-to-tl to-zinc-900 from-zinc-700 w-full">
      {/* <!-- Left side --> */}
      <div className="flex flex-col min-w-64 max-w-100 ml-2 my-2">
        {/* Logo banner */}
        {/* Make a color gradient for the logo text */}
        <div className="self-center w-full">
            {/* Make a color gradient for the hours text */}
            <div className="text-transparent self-center bg-clip-text bg-gradient-to-tr from-sky-300 to-red-400">
                {/* <!-- Hour --> */}
                <div className="text-[10rem] leading-none text-center font-black line-clamp-1">HIMA</div>
            </div>
        </div>
        {/* <!-- Top box --> */}
        <div className="flex-0">
          <TotalHoursCard/>
        </div>
        {/* <!-- Middle box --> */}
        <div className="flex-1 h-full flex">
          <PoolList className="mt-2 grow"/>
        </div>
        {/* <!-- Bottom box --> */}
        <div className="flex-0">
          <SettingsButton className="mt-2"/>
        </div>
      </div>
      
      {/* <!-- Right side --> */}
      <div className="min-w-48 grow flex">
          <EventsList className="grow"/>
      </div>
    </div>
  );
}
