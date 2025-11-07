"use client";

import React, { useState } from "react";
import { Pool } from "@/lib/models/Pool";
import { calculateAmount } from "@/lib/logic";
import dayjs from "dayjs";
import { deserializeToEvent } from "@/lib/models/Event";
import { selectEvents } from "@/lib/features/eventListSlice";
import { useAppSelector } from "@/lib/hooks";

type PoolListingProps = {
  className?: string;
  pool: Pool;
};

const PoolListing: React.FC<PoolListingProps> = ({ className, pool }) => {
  const events = useAppSelector(selectEvents).map((event: EventDto) =>
    deserializeToEvent(event)
  );

  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  const amount = calculateAmount(
    dayjs(),
    pool,
    events.filter((event) => event.poolId === pool.id)
  );

  return (
    <Card className={`${className}`}>
      ${amount}
    </Card>
  );
};

export default PoolListing;
