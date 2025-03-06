"use client"

import React, { useState } from 'react';
import { PoolDetailsOverlay } from './pool_details_overlay';
import { flip, safePolygon, shift, useClientPoint, useFloating, useHover, useInteractions } from '@floating-ui/react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useAppDispatch } from '@/lib/hooks';
import { removePool } from '@/lib/features/poolListSlice';

type PoolListingProps = {
    className?: string;
    name: string;
    amount: number;
    id: number;
}

const PoolListing: React.FC<PoolListingProps> = ({className, name, amount, id}) => {
    const dispatch = useAppDispatch();
    
    // Actions panel setup
    const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);

    // Details hover setup
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
   
    const {refs, floatingStyles, context} = useFloating({
        open: isDetailsOpen,
        onOpenChange: setIsDetailsOpen,
        placement: 'top',
        middleware: [flip(), shift()],
    });
    
    const hover = useHover(context, {
        restMs: 1000,
        // If their cursor never rests, open it after 1000ms as a
        // fallback.
        delay: {open: 1000},
        handleClose: safePolygon(),
    });
    
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
    ]);

    return (
        <>
            <div className={`${className} ${!isActionsPanelOpen && `rounded-b-lg`} rounded-lg bg-blue-300 mt-2 mx-2
            transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102
            hover:drop-shadow-lg p-2`}>
                <div className="flex flex-col w-full cursor-pointer"
                onClick={() => setIsActionsPanelOpen(!isActionsPanelOpen)}
                ref={refs.setReference}
                {...getReferenceProps()}>
                    {/* <!-- Name --> */}
                    <div className="text-2xl h-full w-full line-clamp-1 font-bold">{name}</div>
                    {/* <!-- Hours --> */}
                    <div className="text-xl h-full w-full">
                        {amount}
                        <span className="text-sm">hrs</span>
                    </div>
                </div>
                {isActionsPanelOpen && (
                    <div className={`relative border-t-black/10 border-t-2 flex justify-between`}>
                        <div>
                            <PencilSquareIcon className='stroke-black size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer'/>
                        </div>
                        <div>
                            <TrashIcon className='stroke-black size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer' onClick={() => dispatch(removePool(id))}/>
                        </div>
                    </div>
                )}
            </div>

            
            {isDetailsOpen && (
                <div
                className="pointer-events-none"
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                >
                    <PoolDetailsOverlay pool={id}/>
                </div>
            )}
        </>
    );
}

export default PoolListing;