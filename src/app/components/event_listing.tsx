"use client"
import { removeEvent } from '@/lib/features/eventListSlice';
import { selectPools } from '@/lib/features/poolListSlice';
import { useAppDispatch, useAppSelector } from '@/lib/hooks';
import { PPLEvent } from '@/lib/models/PPLEvent';
import { DeserializeToPool } from '@/lib/models/PPLPool';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

type EventListingProps = {
    className?: string;
    event: PPLEvent;
}

const EventListing: React.FC<EventListingProps> = ({className, event}) => {
    const dispatch = useAppDispatch();
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
    let pool = useAppSelector(selectPools).map((pool) => DeserializeToPool(pool)).find((pool) => pool.id == event.pool_id);
    if (pool == undefined) {
        console.error(`Could not find pool of ID [${event.pool_id}]`)
    }

    return (
        <div className={`${className} flex flex-col bg-red-400 m-2 rounded-lg transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:drop-shadow-lg`}>
            <div className={`flex flex-row cursor-pointer`}
            onClick={() => setIsDetailsPanelOpen(!isDetailsPanelOpen)}>
                {/* <!-- Date --> */}
                <div className="h-full self-justify-center self-center w-32 p-2">
                    <div className="text-3xl h-2/3 w-full text-center overflow-hidden">{event.date.format("MM/DD")}</div>
                </div>
                {/* <!-- Hours --> */}
                <div className="flex flex-col justify-center items-center h-full w-24 p-2">
                    <div className="text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis">{event.hours}</div>
                    <div className="text-sm h-1/3 w-full text-center">hrs</div>
                </div>
                <div className="flex flex-col w-full m-2 self-center">
                    {/* <!-- Title of event --> */}
                    <div className="text-xl h-full w-full overflow-hidden text-ellipsis font-normal">{event.title}</div>
                    {/* <!-- Pool name --> */}
                    <div className="text-m h-full w-full">Pool: {pool!.name}</div>
                </div>
            </div>
            {isDetailsPanelOpen && (
                <>
                    <div className={`relative border-t-black/10 border-t-2 w-full text-lg flex flex-col`}>
                        <div className='font-normal w-full text-center p-2'>
                            <span className='m-1 text-2xl font-semibold'>{event.description}</span>
                        </div>
                    </div>
                    <div className={`relative border-t-black/10 border-t-2 flex justify-between`}>
                        <PencilSquareIcon className='stroke-black size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer'/>
                        <div></div>
                        <TrashIcon className='stroke-black size-7 m-1 p-0.5 rounded-full hover:bg-black/10 hover:cursor-pointer'
                        onClick={() => dispatch(removeEvent(event.id))}/>
                    </div>
                </>
            )}
        </div>
    );
}

export default EventListing;