"use client";

import React, { useState } from "react";
import { PPLPool } from "@/lib/models/PPLPool";
import PoolDetailsPanel from "./PoolDetailsPanel";
import { calculateAmount } from "@/lib/logic";
import dayjs from "dayjs";
import { deserializeToEvent } from "@/lib/models/PPLEvent";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";

type PoolListingProps = {
  className?: string;
  pool: PPLPool;
};

const PoolListing: React.FC<PoolListingProps> = ({ className, pool }) => {
  const events = useAppSelector(selectEvents).map((event) =>
    deserializeToEvent(event)
  ); 

  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  const amount = calculateAmount(
    dayjs(),
    pool,
    events.filter((event) => event.poolId === pool.id)
  );

  return (
    <div
      className={`${className} ${
        !isDetailsPanelOpen && `rounded-b-lg`
      } rounded-lg bg-blue-300 mt-2 mx-2
        transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102
        hover:drop-shadow-lg p-2`}
    >
      <div
        className="flex w-full cursor-pointer"
        onClick={() => {
          setIsDetailsPanelOpen(!isDetailsPanelOpen);
        }}
      >
        {/* <!-- Hours --> */}
        <div className="text-3xl font-medium h-full w-full flex-1/4">
          {amount}
          <span className="text-sm">hrs</span>
        </div>
        {/* <!-- Name --> */}
        <div
          className={`text-2xl h-full w-full flex-3/4 line-clamp-1
            place-self-center font-bold`}
        >
          {pool.name}
        </div>
      </div>
      {isDetailsPanelOpen && <PoolDetailsPanel pool={pool} />}
    </div>
  );
};

export default PoolListing;
