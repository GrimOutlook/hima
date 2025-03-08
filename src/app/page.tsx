'use client'
import EventsList from "./components/events_list";
import PoolList from "./components/pools_list";
import SettingsButton from "./components/settings_button";
import TotalHoursCard from "./components/total_hours_card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { DeserializeToPool, PPLPool } from "@/lib/models/PPLPool";
import { selectPools } from "@/lib/features/poolListSlice";
import { calculateAmount } from "@/lib/logic";
import dayjs from "dayjs";
import PoolForm from "./components/pool_form";
import EventForm from "./components/event_form";
import Alert from "./components/alert";

export default function Home() {
  const dispatch = useAppDispatch();
  const pools = useAppSelector(selectPools).map((pool) => DeserializeToPool(pool));

  const calculateTotal = (pools: PPLPool[]) => {
    if (pools.length <= 0) {
      return 0
    }

    return pools.map((pool) => calculateAmount(dayjs(), pool, [])).reduce((acc, curr) => acc + curr)
  }

  return (
    <>
      <div className="flex flex-row text-gray-700 bg-linear-to-tr from-zinc-900 to-zinc-800 w-full max-h-dvh">
        {/* <!-- Left side --> */}
        <div className="flex flex-col min-w-64 max-w-100 ml-2 mb-2 max-h-dvh">
          {/* Logo banner */}
          {/* Make a color gradient for the logo text */}
          <div className="self-center w-full max-h-36">
              {/* Make a color gradient for the hours text */}
              <div className="text-transparent self-center bg-clip-text bg-linear-to-tr from-sky-300 to-red-400">
                  {/* <!-- Hour --> */}
                  <div className="text-[9rem] leading-none text-center font-black line-clamp-1">HIMA</div>
              </div>
          </div>
          {/* <!-- Top box --> */}
          <div className="flex-none">
            <TotalHoursCard className="mt-2 h-auto" hours={calculateTotal(pools)}/>
          </div>
          {/* <!-- Middle box --> */}
          <div className="grow flex flex-col min-h-0">
            <PoolList className="mt-2 grow"/>
          </div>
          {/* <!-- Bottom box --> */}
          <div className="flex-none">
            <SettingsButton className="mt-2 h-24 w-full"/>
          </div>
        </div>
        
        {/* <!-- Right side --> */}
        <div className="min-w-48 grow flex">
            <EventsList className="grow"/>
        </div>
      </div>
      <Alert/>
      <PoolForm/>
      <EventForm/>
      {/* <SettingsMenu/> */}
    </>
  );
}
