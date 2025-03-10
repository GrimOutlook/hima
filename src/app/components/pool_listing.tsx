"use client";

import React, { useState } from "react";
import dayjs from "dayjs";
import {
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { removePool } from "@/lib/features/poolListSlice";
import { PPLPool } from "@/lib/models/PPLPool";
import { calculateAmount } from "@/lib/logic";
import { selectEvents } from "@/lib/features/eventListSlice";
import { DeserializeToEvent } from "@/lib/models/PPLEvent";

type PoolListingProps = {
  className?: string;
  pool: PPLPool;
};

const PoolListing: React.FC<PoolListingProps> = ({ className, pool }) => {
  const dispatch = useAppDispatch();
  const events = useAppSelector(selectEvents).map((event) =>
    DeserializeToEvent(event)
  );

  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);

  const amount = calculateAmount(
    dayjs(),
    pool,
    events.filter((event) => event.pool_id == pool.id)
  );

  return (
    <div
      className={`${className} ${
        !isDetailsPanelOpen && `rounded-b-lg`
      } rounded-lg bg-blue-300 mt-2 mx-2
        transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102
        hover:drop-shadow-lg p-2`}
    >
      <div
        className="flex w-full cursor-pointer"
        onClick={() => {
          setIsDetailsPanelOpen(!isDetailsPanelOpen);
        }}
      >
        {/* <!-- Hours --> */}
        <div className="text-3xl font-medium h-full w-full flex-1/4">
          {amount}
          <span className="text-sm">hrs</span>
        </div>
        {/* <!-- Name --> */}
        <div className="text-2xl h-full w-full flex-3/4 line-clamp-1 place-self-center font-bold">
          {pool.name}
        </div>
      </div>
      {isDetailsPanelOpen && (
        <>
          <div
            className={`relative border-t-black/10 border-t-2 w-full text-lg flex flex-col`}
          >
            {pool.description && (
              <div className="font-normal w-full text-left p-2">
                <span className=" m-0.5">{pool.description}</span>
              </div>
            )}
            <div className="font-normal w-full text-center p-2">
              <span className="m-0.5">Accrues</span>
              <span className="m-1 text-2xl font-semibold">{pool.amount}</span>
              <span className="m-0.5">hours</span>
              <span className="m-1 text-2xl font-semibold">{pool.period}</span>
            </div>
            <div className="text-md font-normal w-full text-center p-2">
              <span className="m-0.5">Starting on</span>
              <span className="m-1 text-xl font-semibold">
                {pool.startDate.format("YYYY/MM/DD")}
              </span>
              <span className="m-0.5">with</span>
              <span className="m-1 text-xl font-semibold">
                {pool.startAmount}
              </span>
              <span className="m-0.5">hrs</span>
            </div>
          </div>
          <div
            className={`relative border-t-black/10 border-t-2 flex justify-between`}
          >
            <PencilSquareIcon className="stroke-gray-700 size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer" />
            <EyeSlashIcon
              className={`stroke-gray-700 size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer`}
            />
            <TrashIcon
              className="stroke-gray-700 size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer"
              onClick={() => dispatch(removePool(pool.id))}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default PoolListing;
