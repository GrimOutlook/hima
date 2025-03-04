"use client"
import React from 'react';

type EventListingProps = {
    className?: string;
    amount: number;
    description: string;
    pool: string;
}

const EventListing: React.FC<EventListingProps> = ({className, amount, description, pool}) => {
    return (
        <div className={`${className} flex flex-row bg-red-400 m-2 rounded-lg h-18 transition duration-150 ease-in-out hover:-translate-y-1 hover:scale-102 hover:drop-shadow-lg cursor-pointer`}>
            {/* <!-- Hours --> */}
            <div className="flex flex-col justify-center items-center h-full w-24 p-2">
                <div className="text-4xl h-2/3 w-full text-center overflow-hidden text-ellipsis">
                    ${amount}
                </div>
                <div className="text-sm h-1/3 w-full text-center">hrs</div>
            </div>
            <div className="flex flex-col w-full m-2">
                {/* <!-- Description of event --> */}
                <div className="text-xl h-full w-full overflow-hidden text-ellipsis font-normal">${description}</div>
                {/* <!-- Pool name --> */}
                <div className="text-m h-full w-full">Pool: ${pool}</div>
            </div>
        </div>
    );
}

export default EventListing;