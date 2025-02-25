import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";

export default function Home() {
  return (
    <div className="flex flex-row h-full home_background">
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
        <EventsList/>
    </div>
  );
}
