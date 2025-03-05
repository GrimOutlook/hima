"use client"

import React, { useState } from 'react';
import { PoolDetailsOverlay } from './pool_details_overlay';
import { flip, safePolygon, shift, useClientPoint, useFloating, useHover, useInteractions } from '@floating-ui/react';

type PoolListingProps = {
    className?: string;
    name: string;
    amount: number;
    id: number;
}

const PoolListing: React.FC<PoolListingProps> = ({className, name, amount, id}) => {
    
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
   
    const {refs, floatingStyles, context} = useFloating({
        open: isDetailsOpen,
        onOpenChange: setIsDetailsOpen,
        placement: 'top',
        middleware: [flip(), shift()],
    });
    
    const clientPoint = useClientPoint(context);
    const hover = useHover(context, {
        restMs: 500,
        // If their cursor never rests, open it after 1000ms as a
        // fallback.
        delay: {open: 1000},
        handleClose: safePolygon(),
    });
    
    const {getReferenceProps, getFloatingProps} = useInteractions([
        hover,
        clientPoint,
    ]);

    return (
        <>
            <div className={`${className} flex flex-row bg-blue-300 mt-2 mx-2 rounded-lg h-18
            transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102
            hover:drop-shadow-lg cursor-pointer`}
            ref={refs.setReference}
            {...getReferenceProps()}
            >
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