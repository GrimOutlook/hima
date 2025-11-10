"use client"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "../ui/scroll-area";
import { LeaveEvent, deserializeToEvent, firstDate } from "@/lib/models/LeaveEvent"
import EventListing from "@/components/cards/EventListing"

import React from "react";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { selectPools } from "@/lib/features/poolListSlice"
import { LeavePoolDto, deserializeToPool } from "@/lib/models/LeavePool"
import { nextPeriodDateFromDate } from "@/lib/logic";
import { selectProjectionDate, selectShowAllEvents, setShowAllEvents } from "@/lib/features/mainPageOptionsSlice"
import dayjs from "dayjs"
import { Label } from "../ui/label"
import { Checkbox } from "../ui/checkbox"
import { Separator } from "../ui/separator"

export function EventsCard({ className }: React.ComponentProps<"div">) {
  const dispatch = useAppDispatch()

  // Get all the pools created by the user
  const pools = useAppSelector(selectPools)?.map((pool: LeavePoolDto) =>
    deserializeToPool(pool)
  ) || [];

  // Get all events created by the user
  const events = useAppSelector(selectEvents)?.map((event) =>
    deserializeToEvent(event)
  ) || [];

  // Get the options selected by the user
  const selectedDate = dayjs(useAppSelector(selectProjectionDate));
  const showAllEvents = useAppSelector(selectShowAllEvents);

  // If the user has it enabled, add all the leave pool periodic events.
  if (showAllEvents) {
    pools.forEach((pool) => {
      // Generate an event for every time the period has been hit from the start
      // date to the current date.
      let date = dayjs(pool.startDate)
      while (true) {
        date = nextPeriodDateFromDate(date, pool.period)
        if (date.isAfter(selectedDate)) {
          break
        }

        const event: LeaveEvent = {
          title: pool.name + " Addition",
          dates: [date],
          poolTransactions: [{
            date: date,
            hours: pool.amount,
            poolId: pool.id,
          }]
        }
        console.log("Made pool event on " + date.toDate().toDateString() + " for pool " + pool.name)
        events.push(event)
      }

      return events
    })
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="dash-card-title">Events</CardTitle>
        <CardDescription>Occasions that add or remove hours from a pool</CardDescription>
        <CardAction>
          <Button variant="outline">Create</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="h-full min-h-40">
        <ScrollArea className="h-full flex flex-col">
          {/* TODO: Determine if this needs to be sorted. If so, might refactor to make events and pools classes to make it less verbose. */}
          {events.sort((a, b) => firstDate(b).diff(firstDate(a))).map((event: LeaveEvent, idx: number) => (
            <EventListing key={idx} leave_event={event} className="h-fit my-2 py-4" />
          ))}
        </ScrollArea>
      </CardContent>
      <Separator />
      <CardFooter>
        <div className="flex items-center gap-3">
          <Checkbox id="all_events" onCheckedChange={(checked: boolean) => dispatch(setShowAllEvents(checked))} />
          <Label htmlFor="all_events">Show All Events</Label>
        </div>
      </CardFooter>
    </Card>
  )
}
