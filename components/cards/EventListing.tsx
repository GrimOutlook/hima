"use client"

import {
  deserializeToEvent,
  LeaveEventDto } from "@/lib/models/LeaveEvent";
import { Card, CardTitle, CardContent, CardHeader, CardFooter, CardDescription, CardAction } from "../ui/card"
import React, { useState } from "react";
import { useAppSelector } from "@/lib/hooks";
import { selectEvents } from "@/lib/features/eventListSlice";
import { selectPools } from "@/lib/features/poolListSlice";
import { deserializeToPool,
  LeavePoolDto } from "@/lib/models/LeavePool";

type EventListingProps = {
  className?: string;
  eventId: number;
};

const EventListing: React.FC<EventListingProps> = ({ className, eventId }) => {
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const pools = useAppSelector(selectPools)?.map((pool: LeavePoolDto) =>
    deserializeToPool(pool)
  ) || [];
  const dto = useAppSelector(selectEvents).find((ev) => ev.id == eventId)
  if (!dto) {
    console.log("Failed to find event with ID: " + eventId)
    return
  }

  const event = deserializeToEvent(dto)
  const total_hours = event.poolTransactions.reduce((acc, pt) => pt.hours + acc, 0)

  // Gets a displayable list of all of the pools that the event pulls from.
  const affected_pools = Array.from(new Set(event.poolTransactions.map((pt) => pt.poolId)));
  const affected_pools_string = affected_pools.sort().map((id, i) => {
    const eventPoolName = pools.find((p) => p.id == id)!.name
    return (
      <React.Fragment key={i}>
        {i > 0 && <span className="mx-1">|</span>}
        <span className="text-md font-bold">{eventPoolName}</span>
      </React.Fragment>
    )
  });

  const transaction_dates = event.poolTransactions.map((pt) => pt.date).sort();
  let date_string;
  if (transaction_dates.length == 1) {
    date_string = <>on <span className="font-semibold">{transaction_dates[0].toDate().toDateString()}</span></>
  } else {
    date_string = <>from <span className="font-semibold">{transaction_dates[0].toDate().toDateString()}</span> to <span className="font-semibold">{transaction_dates[transaction_dates.length - 1].toDate().toDateString()}</span></>
  }

  let total_hours_color;
  if (total_hours < 0) {
    total_hours_color = "text-red-500"
  } else if (total_hours > 0) {
    total_hours_color = "text-green-500"
  } else {
    total_hours_color = "text-black"
  }


  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{event.title}</CardTitle>
        <CardDescription>{event.description}</CardDescription>
      </CardHeader>
      <CardContent className="text-xl -my-6"><span className={`font-semibold ${total_hours_color}`}>{Math.abs(total_hours)}</span> Hours {date_string}</CardContent>
      <CardFooter className="text-sm text-stone-600 text-nowrap">
        {affected_pools_string}
      </CardFooter>
    </Card >
  )
}

export default EventListing;
