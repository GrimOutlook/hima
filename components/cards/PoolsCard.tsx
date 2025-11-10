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
import { Calendar as CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import dayjs from "dayjs"

type PoolsCardProps = {
  className?: string;
};

const PoolsCard: React.FC<PoolsCardProps> = ({ className }) => {
  const [date, setDate] = React.useState<Date>(dayjs().toDate())
  const dispatch = useAppDispatch();

  // Get all of the pools from the store so we can display them in the list
  const pools = useAppSelector(selectPools)?.map((pool) =>
    deserializeToPool(pool)
  ) || [];

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
            <PoolListing key={pool.id} poolId={pool.id} date={date} className={"my-2 py-4"} />
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              id="projection-date"
              variant="outline"
              data-empty={!date}
              className="data-[empty=true]:text-muted-foreground w-64 self-center justify-start text-left font-normal"
            >
              <CalendarIcon />
              {format(date, "PPP")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar required={true} mode="single" selected={date} onSelect={setDate} />
          </PopoverContent>
        </Popover>
      </CardFooter>
    </Card>
  )
}

export default PoolsCard
