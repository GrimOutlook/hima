'use client'

import EventListing from "./event_listing";
import { useState } from 'react';

export default function EventsList() {
    return (
        <div className="grow flex flex-col bg-zinc-100 dark:bg-zinc-800 rounded-lg m-2 shadow-sm">
            {/* <!-- Events list top bar --> */}
            <div className="grid grid-cols-3 w-full h-18">
                {/* <!-- Empty div for grid spacing --> */}
                <div></div>
                {/* <!-- Event list title --> */}
                <div className="text-4xl text-center self-center justify-self-center m-2 dark:text-zinc-200">Events</div>
                {/* <!-- Add event button --> */}
                <svg className="h-12 w-auto self-center justify-self-end m-4 fill-zinc-500 hover:fill-zinc-900 hover:drop-shadow-lg transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-110" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 9a.75.75 0 0 0-1.5 0v2.25H9a.75.75 0 0 0 0 1.5h2.25V15a.75.75 0 0 0 1.5 0v-2.25H15a.75.75 0 0 0 0-1.5h-2.25V9Z" clipRule="evenodd" />
                </svg>
            </div>
            {/* <!-- Event list --> */}
            <div className="m-2">
                <EventListing/>
            </div>
        </div>
    );
}