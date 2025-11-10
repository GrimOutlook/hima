"use client";

import React, { useState } from "react";
import dayjs from "dayjs";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
  Card } from "../ui/card";
import { CardHeader } from "../ui/card";
import { LeaveEventDto } from "@/lib/models/LeaveEvent";
import { deserializeToPool, } from "@/lib/models/LeavePool";
import { amountInPool } from "@/lib/logic";
import { deserializeToEvent } from "@/lib/models/LeaveEvent";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";
import { selectPools } from "@/lib/features/poolListSlice";

type PoolListingProps = {
  className?: string;
  poolId: number;
  date: Date;
};


const PoolListing: React.FC<PoolListingProps> = ({ className, poolId, date }) => {
  const dto = useAppSelector(selectPools)?.find((pool) => pool.id == poolId)
  const events = useAppSelector(selectEvents)?.map((event: LeaveEventDto) =>
    deserializeToEvent(event)
  ) || [];
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  if (!dto) {
    console.log("No Pool DTO found for ID: " + poolId)
    return
  }

  const pool = deserializeToPool(dto)


  const amount = amountInPool(
    dayjs(date),
    pool,
    events)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{pool.name}</CardTitle>
        <CardDescription>{pool.description}</CardDescription>
      </CardHeader>
      <CardContent className="text-xl -my-6">{amount} Hours</CardContent>
      <CardFooter className="text-sm text-stone-600">+{pool.amount} {pool.period.toString()}</CardFooter>
    </Card>
  );
};

export default PoolListing;
