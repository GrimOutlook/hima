"use client"

import {
  Card,
  CardAction as CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import React from "react";

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function DateSelectionCard({ className }: React.ComponentProps<"div">) {
  const [date, setDate] = React.useState<Date>()
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Date</CardTitle>
        <CardDescription>Leave pool projection date</CardDescription>
      </CardHeader>
      <CardContent className="w-full mx-6">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              data-empty={!date}
              className="data-[empty=true]:text-muted-foreground w-64 self-center justify-start text-left font-normal"
            >
              <CalendarIcon />
              {date ? format(date, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={date} onSelect={setDate} />
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  )
}

export default DateSelectionCard;
