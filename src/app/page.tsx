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
        <div className="self-center w-full rounded-lg mb-2">
          <svg className="h-40 w-full">
            <defs>
              <mask id="maskedText">
                <rect className="h-full w-full" rx="10" fill="white"/>
                <text className="text-[10rem] font-medium" x="50%" y="85%" text-anchor="middle">
                  HIMA
                </text>
              </mask>
            </defs>
            <defs>
              <linearGradient id="logoGradient" spreadMethod="pad" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45)">
                <stop offset="10%" stop-color="#7dd3fc"/>
                <stop offset="90%" stop-color="#fb7185"/>
              </linearGradient>
            </defs>

            <rect className="h-full w-full" fill="url(#logoGradient)" mask="url(#maskedText)"/>
          </svg>
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
