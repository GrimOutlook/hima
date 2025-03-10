"use client";

import { PPLEvent, deserializeToEvent } from "@/lib/models/PPLEvent";
import { EventListTopBar } from "./event_list_top_bar";
import EventListing from "./event_listing";
import React from "react";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";

type PoolListProps = {
  className?: string;
};

const EventsList: React.FC<PoolListProps> = ({ className }) => {
  const events = useAppSelector(selectEvents).map((event) =>
    deserializeToEvent(event)
  );

  return (
    <div
      className={`${className} flex flex-col rounded-lg m-2 shadow-xs bg-linear-to-tr from-sky-300 to-red-400`}
    >
      <div className="bg-zinc-100 flex flex-col grow rounded-lg m-2 min-h-0">
        <EventListTopBar />
        {/* <!-- Event list --> */}
        <div
          className={`m-2 scroll-smooth p-2 overflow-x-hidden 
        overflow-y-auto`}
        >
          {/* This is where event listings go */}
          {events.map((event: PPLEvent) => (
            <EventListing key={event.id} event={event} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default EventsList;
