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
import { Event } from "@/lib/models/Event"
import { EventListing } from "@/components/cards/EventListing"
import dayjs from "dayjs"

const test_events: Event[] = [
  {
    id: 1,
    title: "Birthday Party",
    description: "Mom's birthday party",
    dates: [dayjs("2025-01-01")],
    poolTransactions: [
      {
        date: dayjs("2025-01-01"),
        hours: 8,
        poolId: 0
      }
    ]
  },
  {
    id: 2,
    title: "Doctors Appointment",
    description: "Appointment @ 2pm",
    dates: [dayjs("2025-01-14")],
    poolTransactions: [
      {
        date: dayjs("2025-01-01"),
        hours: 2,
        poolId: 1
      }
    ]
  },
  {
    id: 3,
    title: "Honeymoon",
    description: "Trip from Seoul to Tokyo",
    dates:
      [...Array(14).keys()].map((day_offset) => dayjs("2025-02-01").add(day_offset, 'day'))
    ,
    poolTransactions: [
      {
        date: dayjs("2025-01-01"),
        hours: 8,
        poolId: 0,
      }
    ]
  },
]
const events = test_events

const events_count = events.length

export function EventsCard({ className }: React.ComponentProps<"div">) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Events</CardTitle>
        <CardDescription>Occasions that add or remove hours from a pool</CardDescription>
        <CardAction>
          <Button variant="outline">Create</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ScrollArea>

          {/* This is where event listings go */}
          {events.map((event: Event) => (
            <EventListing key={event.id} event={event} />
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        {events_count} Events Tracked
      </CardFooter>
    </Card>
  )
}
