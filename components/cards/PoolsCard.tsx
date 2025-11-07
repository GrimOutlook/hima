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
    const pools = useAppSelector(selectPools).map((pool) =>
        deserializeToPool(pool)
    );
    return (
        <Card className={className}>
            <CardHeader>
                <CardTitle>Pools</CardTitle>
                <CardDescription>Pools track amount of hours available for paid time off work</CardDescription>
                <CardAction>
                    <Button variant="outline" onClick={() => dispatch(setPoolFormOpenState(true))}>Create</Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                <ScrollArea>
                    {/* This is where pool listings go */}
                    {pools.map((pool: LeavePool) => (
                        <PoolListing key={pool.id} poolId={pool.id} />
                    ))}
                </ScrollArea>
            </CardContent>
            <CardFooter>
                0 Tracked Pools
            </CardFooter>
        </Card>
    )
}

export default PoolsCard
