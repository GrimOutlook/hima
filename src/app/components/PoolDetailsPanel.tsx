"use client";

import {
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { PPLPool } from "@/lib/models/PPLPool";
import React from "react";
import { removePool } from "@/lib/features/poolListSlice";
import { useAppDispatch } from "@/lib/hooks";

type PoolListingDetailsProps = {
  pool: PPLPool;
};

const PoolListing: React.FC<PoolListingDetailsProps> = ({ pool }) => {
  const dispatch = useAppDispatch();

  return (
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
          <span className="m-1 text-xl font-semibold">{pool.startAmount}</span>
          <span className="m-0.5">hrs</span>
        </div>
      </div>
      <div
        className={`relative border-t-black/10 border-t-2 flex justify-between`}
      >
        <PencilSquareIcon
          className={`stroke-gray-700 size-7 m-1 p-0.5
          rounded-full hover:bg-black/10 hover:cursor-pointer`}
        />
        <EyeSlashIcon
          className={`stroke-gray-700 size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer`}
        />
        <TrashIcon
          className={`stroke-gray-700 size-7 m-1 p-0.5 rounded-full
            hover:bg-black/10 hover:cursor-pointer`}
          onClick={() => dispatch(removePool(pool.id))}
        />
      </div>
    </>
  );
};

export default PoolListing;
