"use client"
import { Dayjs } from 'dayjs';
import React from 'react';

type EventListingProps = {
    className?: string;
    date: Dayjs;
    title: string;
    hours: number;
    pool: string;
}

const EventListing: React.FC<EventListingProps> = ({className, date, title, hours, pool}) => {
    return (
        <div className={`${className} flex flex-row bg-red-400 m-2 rounded-lg h-18 transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:drop-shadow-lg cursor-pointer`}>
            {/* <!-- Date --> */}
            <div className="h-full self-justify-center self-center w-32 p-2">
                <div className="text-3xl h-2/3 w-full text-center overflow-hidden">{date.format("MM/DD")}</div>
            </div>
            {/* <!-- Hours --> */}
            <div className="flex flex-col justify-center items-center h-full w-24 p-2">
                <div className="text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis">{hours}</div>
                <div className="text-sm h-1/3 w-full text-center">hrs</div>
            </div>
            <div className="flex flex-col w-full m-2 self-center">
                {/* <!-- Title of event --> */}
                <div className="text-xl h-full w-full overflow-hidden text-ellipsis font-normal">{title}</div>
                {/* <!-- Pool name --> */}
                <div className="text-m h-full w-full">Pool: {pool}</div>
            </div>
        </div>
    );
}

export default EventListing;