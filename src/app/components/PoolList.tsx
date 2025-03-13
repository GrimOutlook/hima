"use client";

import { PPLPool, deserializeToPool } from "@/lib/models/PPLPool";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { PlusCircleIcon } from "@heroicons/react/24/outline";
import PoolListing from "./PoolListing";
import React from "react";
import { selectPools } from "@/lib/features/poolListSlice";
import { setPoolFormOpenState } from "@/lib/features/poolFormSlice";

type PoolListProps = {
  className?: string;
};

const PoolList: React.FC<PoolListProps> = ({ className }) => {
  const dispatch = useAppDispatch();
  const pools = useAppSelector(selectPools).map((pool) =>
    deserializeToPool(pool)
  );

  return (
    /*
     * Don't ask why min-h-0 needs to be here but it makes the list not overflow
     * when it needs to add scroll bars. Thank this guy ->-v
     * https://stackoverflow.com/questions/36230944/prevent-flex-items-from-overflowing-a-container
     */
    <div
      className={`${className} flex flex-col bg-zinc-100 rounded-lg shadow-xs grow min-h-0`}
    >
      {/* <!-- Pool list top bar --> */}
      <div className="grid grid-cols-3 w-full h-18">
        {/* <!-- Empty div for grid spacing --> */}
        <div></div>
        {/* <!-- Pool list title --> */}
        <div className="text-4xl text-center m-2 place-self-center">Pools</div>
        {/* <!-- Add event button --> */}
        <PlusCircleIcon
          className={`h-12 w-12 self-center justify-self-end m-4 fill-zinc-500
          hover:fill-zinc-900 hover:drop-shadow-lg transition duration-150
          ease-in-out hover:-translate-y-1 hover:scale-110 cursor-pointer`}
          viewBox="0 0 24 24"
          onClick={() => dispatch(setPoolFormOpenState(true))}
        />
      </div>
      {/* <!-- Pool list --> */}
      <div className="m-2 p-2 rounded-xs scroll-smooth overflow-y-auto">
        {/* This is where pool listings go */}
        {pools.map((pool: PPLPool) => (
          <PoolListing key={pool.id} pool={pool} />
        ))}
      </div>
    </div>
  );
};

export default PoolList;
