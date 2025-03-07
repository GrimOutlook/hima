'use client'
import React from 'react';

import PoolListing from "./pool_listing";
import { openPoolDialog } from "@/lib/features/poolDialogSlice";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { selectPools } from '@/lib/features/poolListSlice';
import { PPLPool } from '@/lib/models/PPLPool';
import { DeserializeToPool as DeserializeToPool } from '@/lib/models/PPLPool';
import { selectEvents } from '@/lib/features/eventListSlice';
import { DeserializeToEvent } from '@/lib/models/PPLEvent';
import { calculateAmount } from '@/lib/logic';
import dayjs from 'dayjs';

type PoolListProps = {
    className?: string;
}

const PoolList: React.FC<PoolListProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const pools = useAppSelector(selectPools).map((pool) => DeserializeToPool(pool));

    return (
        // Don't ask why min-h-0 needs to be here but it makes the list not overflow when it needs
        // to add scroll bars. Thank this guy -> https://stackoverflow.com/questions/36230944/prevent-flex-items-from-overflowing-a-container
        <div className={`${className} flex flex-col bg-zinc-100 rounded-lg shadow-xs grow min-h-0`}>
            {/* <!-- Pool list top bar --> */}
            <div className="grid grid-cols-3 w-full h-18">
                {/* <!-- Empty div for grid spacing --> */}
                <div></div>
                {/* <!-- Pool list title --> */}
                <div className="text-4xl text-center m-2 place-self-center">Pools</div>
                {/* <!-- Add event button --> */}
                <svg className="h-12 w-12 self-center justify-self-end m-4 fill-zinc-500 hover:fill-zinc-900 hover:drop-shadow-lg transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-110 cursor-pointer" viewBox="0 0 24 24" onClick={() => dispatch(openPoolDialog())}>
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
                </svg>
            </div>
            {/* <!-- Pool list --> */}
            <div className="m-2 p-2 rounded-xs scroll-smooth overflow-y-auto">
                {/* This is where pool listings go */}
                {pools.map((pool: PPLPool) =>(
                    <PoolListing key={pool.id} pool={pool}/>
                ))}
            </div>
        </div>
    );
}

export default PoolList;