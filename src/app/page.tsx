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
