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
import { LeaveEvent, deserializeToEvent } from "@/lib/models/LeaveEvent"
import EventListing from "@/components/cards/EventListing"

import React from "react";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";

export function EventsCard({ className }: React.ComponentProps<"div">) {

  const events = useAppSelector(selectEvents)?.map((event) =>
    deserializeToEvent(event)
  ) || [];

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
          {/* This is where event listings go */}
          {events.map((event: LeaveEvent) => (
            <EventListing key={event.id} eventId={event.id} className="h-fit my-2 py-4" />
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        {events.length} Events Tracked
      </CardFooter>
    </Card>
  )
}
