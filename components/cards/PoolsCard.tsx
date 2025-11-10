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
import PoolListing from "./PoolListing"
import React from "react";
import { Button } from "@/components/ui/button"
import { LeavePool, deserializeToPool } from "@/lib/models/LeavePool"
import { ScrollArea } from "@/components/ui/scroll-area"
import { selectPools } from "@/lib/features/poolListSlice";
import { setPoolFormOpenState } from "@/lib/features/poolFormSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";

import { Calendar } from "@/components/ui/calendar"
import { Calendar as CalendarIcon, TimerReset } from "lucide-react"
import { toast } from "sonner"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import dayjs from "dayjs"
import { selectProjectionDate, setProjectionDate } from "@/lib/features/mainPageOptionsSlice"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Separator } from "../ui/separator";


type PoolsCardProps = {
  className?: string;
};

const PoolsCard: React.FC<PoolsCardProps> = ({ className }) => {
  const dispatch = useAppDispatch();

  // Get the projection date selected by the user
  const selectedDate = dayjs(useAppSelector(selectProjectionDate));

  // Get all of the pools from the store so we can display them in the list
  const pools = useAppSelector(selectPools)?.map((pool) =>
    deserializeToPool(pool)
  ) || [];


  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState<Date | undefined>(selectedDate.toDate())
  const [value, setValue] = React.useState(formatDate(selectedDate.toDate()))

  function setDate(date: Date) {
    dispatch(setProjectionDate(date.getTime()));
    setValue(formatDate(date))
  }

  return (
    <Card className={`${className}`}>
      <CardHeader>
        <CardTitle className="dash-card-title">Pools</CardTitle>
        <CardDescription>Pools track amount of hours available for paid time off work</CardDescription>
        <CardAction>
          <Button variant="outline" onClick={() => dispatch(setPoolFormOpenState(true))}>Create</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="h-full min-h-40">
        <ScrollArea className="h-full flex flex-col">
          {/* This is where pool listings go */}
          {pools.map((pool: LeavePool) => (
            <PoolListing key={pool.id} poolId={pool.id} date={selectedDate.toDate()} className={"my-2 py-4"} />
          ))}
        </ScrollArea>
      </CardContent>
      <Separator />
      <CardFooter>
        <div className="flex flex-col gap-3">
          <Label htmlFor="date" className="px-1">
            Projection Date
          </Label>
          <div className="flex gap-2">
            <div className="relative flex gap-2">
              <Input
                id="date"
                value={value}
                className="bg-background pr-10"
                onChange={(e) => {
                  setValue(e.target.value)
                }}
                onBlur={(e) => {
                  const date = new Date(e.target.value)
                  if (isValidDate(date)) {
                    dispatch(setProjectionDate(date.getTime()))
                    setMonth(date)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setOpen(true)
                  }
                }}
              />
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="date-picker"
                    variant="ghost"
                    className="absolute top-1/2 right-2 size-6 -translate-y-1/2"
                  >
                    <CalendarIcon className="size-3.5" />
                    <span className="sr-only">Select date</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto overflow-hidden p-0"
                  align="end"
                  alignOffset={-8}
                  sideOffset={10}
                >
                  <Calendar
                    mode="single"
                    selected={selectedDate.toDate()}
                    captionLayout="dropdown"
                    month={month}
                    onMonthChange={setMonth}
                    onSelect={(date) => {
                      if (!!date) {
                        dispatch(setProjectionDate(date.getTime()))
                        setValue(formatDate(date))
                      }
                      setOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" size="icon" aria-label="Reset Projection Date" onClick={() => {
              const oldDate = selectedDate.toDate()
              const date = dayjs().toDate()
              setDate(date)
              if (oldDate.toDateString() == date.toDateString()) {
                return
              }

              toast("Date set to today", {
                description: date.toDateString(),
                action: {
                  label: "Undo",
                  onClick: () => {
                    setDate(oldDate)
                  },
                },
              })
            }}>
              <TimerReset />
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}

function formatDate(date: Date | undefined) {
  if (!date) {
    return ""
  }

  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function isValidDate(date: Date | undefined) {
  if (!date) {
    return false
  }
  return !isNaN(date.getTime())
}

export default PoolsCard
