'use client'

import React from 'react';

import { useAppDispatch, useAppSelector } from "@/lib/hooks";

import EventListing from "./event_listing";
import { openEventDialog } from '@/lib/features/eventDialogSlice';
import { openAlertDialog } from '@/lib/features/alertDialogSlice';
import { DeserializeToEvent, PPLEvent } from '@/lib/models/PPLEvent';
import { selectEvents } from '@/lib/features/eventListSlice';
import { selectPools } from '@/lib/features/poolListSlice';
import { DeserializeToPool } from '@/lib/models/PPLPool';
import Alert from './alert';

type PoolListProps = {
    className?: string;
}

const EventsList: React.FC<PoolListProps> = ({className}) => {
    const dispatch = useAppDispatch();
    const events = useAppSelector(selectEvents).map((event) => DeserializeToEvent(event));
    const pools = useAppSelector(selectPools).map((pool) => DeserializeToPool(pool));

    const openEventForm = () => {
        if (pools.length <= 0) {
            dispatch(openAlertDialog({
                timeout: 3,
                title: "No pools available",
                message: "You must create a pool before you can create an event."
            }));
            return;
        }
        dispatch(openEventDialog());
    }

    return (
        <div className={`${className} flex flex-col rounded-lg m-2 shadow-xs bg-linear-to-tr from-sky-300 to-red-400`}>
            <div className='bg-zinc-100 flex flex-col grow rounded-lg m-2 min-h-0'>
                {/* <!-- Events list top bar --> */}
                <div className="grid grid-cols-3 w-full h-18">
                    {/* <!-- Empty div for grid spacing --> */}
                    <div></div>
                    {/* <!-- Event list title --> */}
                    <div className="text-4xl text-center self-center justify-self-center m-2 dark:text-zinc-200">Events</div>
                    {/* <!-- Add event button --> */}
                    <svg className="h-12 w-auto self-center justify-self-end m-4 fill-zinc-500 hover:fill-zinc-900 hover:drop-shadow-lg transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-110 cursor-pointer" viewBox="0 0 24 24" onClick={() => openEventForm()}>
                        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
                    </svg>
                </div>
                {/* <!-- Event list --> */}
                <div className="m-2 scroll-smooth p-2 overflow-x-hidden overflow-y-auto">
                    {/* This is where event listings go */}
                    {events.map((event: PPLEvent) =>(
                        <EventListing key={event.id} event={event}/>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default EventsList;