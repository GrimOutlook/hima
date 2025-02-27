// import { Dialog } from '@headlessui/react';

import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";

export default function Home() {
  return (
    <div className="flex flex-row text-gray-700 bg-gradient-to-tl to-zinc-900 from-zinc-700">
        {/* <!-- Left side --> */}
        <div className="flex flex-col min-w-64 w-1/3 ml-2 my-2">
            {/* <!-- Top box --> */}
            <TotalHoursCard/>
            {/* <!-- Middle box --> */}
            <PoolList/>
            {/* <!-- Bottom box --> */}
            <SettingsButton/>
        </div>
        
        {/* <!-- Right side --> */}
        <div className="min-w-48 w-2/3">
            <EventsList/>
        </div>
    </div>
  );
}
