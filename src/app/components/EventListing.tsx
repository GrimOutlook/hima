"use client";

import React, { useState } from "react";
import { EventDetailsPanel } from "./EventDetailsPanel";
import { PPLEvent } from "@/lib/models/PPLEvent";
import { deserializeToPool } from "@/lib/models/PPLPool";
import { selectPools } from "@/lib/features/poolListSlice";
import { useAppSelector } from "@/lib/hooks";

type EventListingProps = {
  className?: string;
  event: PPLEvent;
};

// eslint-disable-next-line max-lines-per-function
const EventListing: React.FC<EventListingProps> = ({ className, event }) => {
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const affectedPool = useAppSelector(selectPools)
    .map((pool) => deserializeToPool(pool))
    .find((pool) => pool.id === event.pool_id);
  if (!affectedPool) {
    // TODO: Add client side logging for when this happens
    // eslint-disable-next-line no-console, no-undef
    console.error(`Could not find pool of ID [${event.pool_id}]`);
  }

  return (
    <div
      className={`${className} flex flex-col bg-red-400 m-2 rounded-lg transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:drop-shadow-lg`}
    >
      <div
        className={`flex flex-row cursor-pointer`}
        onClick={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}
      >
        {/* <!-- Date --> */}
        <div className="h-full self-justify-center self-center w-32 p-2">
          <div className="text-3xl h-2/3 w-full text-center overflow-hidden">
            {event.date.format("MM/DD")}
          </div>
        </div>
        {/* <!-- Hours --> */}
        <div
          className={`flex flex-col justify-center items-center h-full w-24 p-2`}
        >
          <div
            className={`text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis`}
          >
            {event.hours}
          </div>
          <div className="text-sm h-1/3 w-full text-center">hrs</div>
        </div>
        <div className="flex flex-col w-full m-2 self-center">
          {/* <!-- Title of event --> */}
          <div
            className={`text-xl h-full w-full overflow-hidden text-ellipsis font-normal`}
          >
            {event.title}
          </div>
          {/* <!-- Pool name --> */}
          <div className="text-m h-full w-full">Pool: {affectedPool!.name}</div>
        </div>
      </div>
      {isDetailsPanelOpen && (
        <>
          <EventDetailsPanel event={event} />
        </>
      )}
    </div>
  );
};

export default EventListing;
