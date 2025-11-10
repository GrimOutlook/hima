"use client"

import dayjs from "dayjs"
import { Pencil } from "lucide-react"
import React from "react";

import { selectPools } from "@/lib/features/poolListSlice";
import { useAppSelector } from "@/lib/hooks";
import {
  LeaveEvent,
} from "@/lib/models/LeaveEvent";
import { deserializeToPool,
  LeavePoolDto } from "@/lib/models/LeavePool";

import { Button } from "../ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card"

type EventListingProps = {
  className?: string;
  leave_event: LeaveEvent;
};

const EventListing: React.FC<EventListingProps> = ({ className, leave_event }) => {
  const pools = useAppSelector(selectPools)?.map((pool: LeavePoolDto) =>
    deserializeToPool(pool)
  ) || [];

  const total_hours = leave_event.poolTransactions.reduce((acc, pt) => pt.hours + acc, 0)

  // Gets a displayable list of all of the pools that the event pulls from.
  const affected_pools = Array.from(new Set(leave_event.poolTransactions.map((pt) => pt.poolId)));
  const affected_pools_string = affected_pools.sort().map((id, i) => {
    const eventPoolName = pools.find((p) => p.id == id)!.name
    return (
      <React.Fragment key={i}>
        {i > 0 && <span className="mx-1">|</span>}
        <span className="text-md font-bold">{eventPoolName}</span>
      </React.Fragment>
    )
  });

  const transaction_dates = leave_event.poolTransactions.map((pt) => dayjs(pt.date)).sort();
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
        <CardTitle>{leave_event.title}</CardTitle>
        <CardDescription>{leave_event.description}</CardDescription>
        <CardAction>
          {leave_event.id != null &&
            <Button variant="outline" size="icon-sm" aria-label="Reset Projection Date" onClick={() => {
              console.debug("Editing event")
            }}>
              <Pencil />
            </Button>
          }
        </CardAction>
      </CardHeader>
      <CardContent className="text-xl -my-6"><span className={`font-semibold ${total_hours_color}`}>{Math.abs(total_hours)}</span> Hours {date_string}</CardContent>
      <CardFooter className="text-sm text-stone-600 text-nowrap">
        {affected_pools_string}
      </CardFooter>
    </Card >
  )
}

export default EventListing;
