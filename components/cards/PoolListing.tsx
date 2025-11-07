"use client";

import React, { useState } from "react";
import dayjs from "dayjs";
import { Card } from "../ui/card";
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
};

const PoolListing: React.FC<PoolListingProps> = ({ className, poolId }) => {
    const dto = useAppSelector(selectPools)?.find((pool) => pool.id == poolId)
    if (!dto) {
        console.log("No Pool DTO found for ID: " + poolId)
        return
    }

    const pool = deserializeToPool(dto)
    const events = useAppSelector(selectEvents)?.map((event: LeaveEventDto) =>
        deserializeToEvent(event)
    ) || [];

    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

    const date = dayjs()
    const amount = amountInPool(
        date,
        pool,
        events)

    return (
        <Card><CardHeader>{amount}</CardHeader></Card>
    );
};

export default PoolListing;
