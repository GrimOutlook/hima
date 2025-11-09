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


type PoolsCardProps = {
  className?: string;
};

const PoolsCard: React.FC<PoolsCardProps> = ({ className }) => {
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
            <PoolListing key={pool.id} poolId={pool.id} className={"my-2 py-4"} />
          ))}
        </ScrollArea>
      </CardContent>
      <CardFooter>
        {pools.length} Tracked Pools
      </CardFooter>
    </Card>
  )
}

export default PoolsCard
