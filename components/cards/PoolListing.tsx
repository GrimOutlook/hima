"use client";

import dayjs from "dayjs";
import { Pencil } from "lucide-react";
import React from "react";

import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";
import { amountInPool } from "@/lib/logic";
import { LeaveEventDto } from "@/lib/models/LeaveEvent";
import { deserializeToEvent } from "@/lib/models/LeaveEvent";
import {
  LeavePool,
} from "@/lib/models/LeavePool";

import { Button } from "../ui/button";
import {
  Card, CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle } from "../ui/card";
import { CardHeader } from "../ui/card";

type PoolListingProps = {
  className?: string;
  pool: LeavePool;
  date: Date;
};


const PoolListing: React.FC<PoolListingProps> = ({ className, pool, date }) => {
  const events = useAppSelector(selectEvents)?.map((event: LeaveEventDto) =>
    deserializeToEvent(event)
  ) || [];

  const amount = amountInPool(
    dayjs(date),
    pool,
    events)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{pool.name}</CardTitle>
        <CardDescription>{pool.description}</CardDescription>
        <CardAction>
          <Button variant="outline" size="icon-sm" aria-label="Reset Projection Date" onClick={() => {
            console.debug("Editing pool")
          }}>
            <Pencil />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="text-xl -my-6">{amount} Hours</CardContent>
      <CardFooter className="text-sm text-stone-600">+{pool.amount} {pool.period.toString()}</CardFooter>
    </Card>
  );
};

export default PoolListing;
