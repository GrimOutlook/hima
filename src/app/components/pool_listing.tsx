"use client"

import { closePoolDetailsOverlay, openPoolDetailsOverlay } from '@/lib/features/poolDetailsOverlaySlice';
import { useAppDispatch } from '@/lib/hooks';
import React from 'react';

type PoolListingProps = {
    className?: string;
    name: string;
    amount: number;
    id: number;
}

const PoolListing: React.FC<PoolListingProps> = ({className, name, amount, id}) => {
    const dispatch = useAppDispatch();

    return (
        <div className={`${className} flex flex-row bg-blue-300 mt-2 mx-2 rounded-lg h-18
        transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102
        hover:drop-shadow-lg cursor-pointer`}
        onMouseEnter={() => dispatch(openPoolDetailsOverlay(id))}
        onMouseLeave={() => dispatch(closePoolDetailsOverlay())}>
            <div className="flex flex-col w-full">
                {/* <!-- Name --> */}
                <div className="text-2xl h-full w-full p-2 line-clamp-1 font-bold">{name}</div>
                {/* <!-- Hours --> */}
                <div className="text-xl h-full w-full pl-2">
                    {amount}
                    <span className="text-sm">hrs</span>
                </div>
            </div>
        </div>
    );
}

export default PoolListing;