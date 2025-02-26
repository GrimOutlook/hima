import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";

export default function Home() {
  return (
    <div className="flex flex-row h-full dark:bg-gradient-to-br dark:to-zinc-800 dark:from-zinc-900 bg-gradient-to-tr to-zinc-200 from-zinc-100">
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
        <div className="h-full min-w-48 w-2/3">
            <EventsList/>
        </div>
    </div>
  );
}
